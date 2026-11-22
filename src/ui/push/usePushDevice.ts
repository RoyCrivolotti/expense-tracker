import { useCallback, useEffect, useMemo, useState } from 'react'
import { devicePlatform } from '../../config/device'
import type { PushMode } from '../../domain/ports/pushRepository'
import {
  fetchPushConfig,
  fetchPushDevices,
  removePushDevice,
  savePushChoice,
  savePushDevice,
  type PushDevices,
} from '../../data/pushApi'
import { OWNER_KEYS, ownerKey, useAccountOwner } from '../hooks/accountOwner'
import { applicationServerKey, deviceLabel, pushSupportFrom, type PushSupport } from './pushSupport'

/** Where this device stands: what the card shows. */
export type PushDeviceStatus =
  'loading' | 'unsupported' | 'not-installed' | 'not-configured' | 'denied' | 'off' | 'on' | 'failed'

export interface PushDevice {
  status: PushDeviceStatus
  /** The id of this device's row, when it is on. */
  thisId: string | null
  list: PushDevices
  busy: boolean
  error: string | null
  /** Reads this device's standing again after a read that failed. */
  retry: () => void
  turnOn: () => Promise<void>
  turnOff: () => Promise<void>
  forget: (id: string) => Promise<void>
  choose: (mode: PushMode) => Promise<void>
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

const EMPTY: PushDevices = { devices: [], settings: null }

/** What the browser says about this device. Read once per mount so a test can stub it. */
function support(): PushSupport {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return pushSupportFrom({
    platform: devicePlatform(),
    hasPush: 'PushManager' in window && 'Notification' in window,
    standalone,
  })
}

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** The browser's remembered id for this device's row, kept per person so another person on this browser starts afresh. */
function remembered(owner: string | undefined) {
  const key = ownerKey(OWNER_KEYS.pushDevice, owner)
  return {
    read: (): string | null => {
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
    },
    write: (id: string | null) => {
      try {
        if (id === null) localStorage.removeItem(key)
        else localStorage.setItem(key, id)
      } catch {
        /* a browser that refuses storage asks the server again next time */
      }
    },
  }
}

/** How long to wait for the service worker before deciding this browser has none that can receive a push. */
const READY_MS = 5000

/**
 * The worker's registration once it is active, or null where none becomes active in time: a page with no worker
 * (a dev server), or one whose registration failed. `navigator.serviceWorker.ready` alone would wait forever.
 */
async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), READY_MS))
  return Promise.race([navigator.serviceWorker.ready, timeout])
}

async function subscription(): Promise<PushSubscription | null> {
  const registration = await readyRegistration()
  return registration ? registration.pushManager.getSubscription() : null
}

type Memory = ReturnType<typeof remembered>

interface Probe {
  status: PushDeviceStatus
  id: string | null
  list: PushDevices
  key: string | null
}

/**
 * Where this device stands, from the browser and the server. A subscription the browser holds under no remembered row
 * (a fresh sign-in, a browser whose storage was cleared) is saved; one whose remembered row is gone was turned off from
 * another device, so the browser lets it go rather than bring it back.
 */
async function probe(memory: Memory): Promise<Probe> {
  const supported = support()
  if (supported !== 'ok') return { status: supported, id: null, list: EMPTY, key: null }
  const [key, list] = await Promise.all([fetchPushConfig(), fetchPushDevices()])
  if (key === null) return { status: 'not-configured', id: null, list, key }
  if (Notification.permission === 'denied') return { status: 'denied', id: null, list, key }
  if (Notification.permission !== 'granted') return { status: 'off', id: null, list, key }
  const registration = await readyRegistration()
  if (!registration) return { status: 'unsupported', id: null, list, key }
  const sub = await registration.pushManager.getSubscription()
  if (!sub) return { status: 'off', id: null, list, key }
  const known = memory.read()
  if (known && list.devices.some((d) => d.id === known)) return { status: 'on', id: known, list, key }
  if (known) {
    await sub.unsubscribe().catch(() => undefined)
    memory.write(null)
    return { status: 'off', id: null, list, key }
  }
  const id = await savePushDevice(sub.toJSON(), deviceLabel(devicePlatform()), zone())
  memory.write(id)
  return { status: 'on', id, list: await fetchPushDevices(), key }
}

/**
 * The permission prompt must come from the person's tap, and the subscription follows in the same handler. A prompt
 * refused is `denied`; one dismissed leaves the device `off`, to be asked again.
 */
async function enable(
  key: string,
  memory: Memory,
): Promise<{ id: string } | { status: 'denied' | 'off' }> {
  if ((await Notification.requestPermission()) !== 'granted')
    return { status: Notification.permission === 'denied' ? 'denied' : 'off' }
  const registration = await readyRegistration()
  if (!registration) throw new Error('This browser has no service worker, so it cannot receive notifications.')
  const sub = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(key),
  })
  const id = await savePushDevice(sub.toJSON(), deviceLabel(devicePlatform()), zone())
  memory.write(id)
  return { id }
}

/** The server's row goes first, so a browser that then fails to unsubscribe is at worst one the sender finds gone. */
async function disable(
  thisId: string | null,
  memory: Memory,
): Promise<void> {
  if (thisId) await removePushDevice(thisId)
  const sub = await subscription()
  if (sub) await sub.unsubscribe().catch(() => undefined)
  memory.write(null)
}

interface Probed extends Probe {
  error: string | null
}

const UNPROBED: Probed = { status: 'loading', id: null, list: EMPTY, key: null, error: null }

/** Where this device stands, read when the card opens and again on request. */
function useProbe(memory: Memory) {
  const [probed, setProbed] = useState<Probed>(UNPROBED)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let current = true
    probe(memory).then(
      (found) => current && setProbed({ ...found, error: null }),
      (e: unknown) => current && setProbed({ ...UNPROBED, status: 'failed', error: messageOf(e) }),
    )
    return () => {
      current = false
    }
  }, [memory, attempt])
  const retry = () => {
    setProbed(UNPROBED)
    setAttempt((n) => n + 1)
  }
  return { probed, setProbed, retry }
}

/**
 * This device's notifications: whether they can be on, whether they are, and the three things the person can do
 * (turn this device on or off, forget another device, choose how to be told).
 */
export function usePushDevice(): PushDevice {
  const owner = useAccountOwner()
  const memory = useMemo(() => remembered(owner), [owner])
  const { probed, setProbed, retry } = useProbe(memory)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const settle = (
    status: PushDeviceStatus,
    id: string | null,
  ) => setProbed((p) => ({ ...p, status, id }))

  /** Runs a change, then reads the devices again rather than patching the list by hand. */
  const act = useCallback(
    async (run: () => Promise<void>) => {
      setBusy(true)
      setError(null)
      try {
        await run()
        const list = await fetchPushDevices()
        setProbed((p) => ({ ...p, list }))
      } catch (e) {
        setError(messageOf(e))
      } finally {
        setBusy(false)
      }
    },
    [setProbed],
  )

  return {
    status: probed.status,
    thisId: probed.id,
    list: probed.list,
    busy,
    error: error ?? probed.error,
    retry,
    turnOn: () =>
      act(async () => {
        if (probed.key === null) return
        const result = await enable(probed.key, memory)
        if ('id' in result) settle('on', result.id)
        else settle(result.status, null)
      }),
    turnOff: () =>
      act(async () => {
        await disable(probed.id, memory)
        settle('off', null)
      }),
    forget: (id) => act(() => removePushDevice(id)),
    choose: (mode) => act(() => savePushChoice({ mode, timeZone: zone() })),
  }
}
