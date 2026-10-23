import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { StoppedSeries } from '../../engine'
import { OWNER_KEYS, ownerKey, useAccountOwner } from '../hooks/accountOwner'

/** A series the owner told the Upcoming card to stop suggesting. */
export interface StoppedEntry {
  /** The date of the series' newest charge when it was stopped: a charge after it brings the series back. */
  after: string
  /** What the series was called, so the list in Settings can name it. */
  label: string
}

export type StoppedEntries = Readonly<Record<string, StoppedEntry>>

const NONE: StoppedEntries = {}

/**
 * Held back when the browser refuses the write (a private window, a full store), so the series
 * stays stopped for as long as the page is open, if not after it. One list for each key, which is one person's.
 */
const unsaved = new Map<string, string>()
const caches = new Map<string, { raw: string | null; entries: StoppedEntries }>()
const listeners = new Set<() => void>()

function isEntry(value: unknown): value is StoppedEntry {
  if (typeof value !== 'object' || value === null) return false
  const { after, label } = value as Record<string, unknown>
  return typeof after === 'string' && typeof label === 'string'
}

function parse(raw: string | null): StoppedEntries {
  if (!raw) return NONE
  try {
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return NONE
    const entries: Record<string, StoppedEntry> = {}
    for (const [key, value] of Object.entries(data)) {
      if (isEntry(value)) entries[key] = { after: value.after, label: value.label }
    }
    return entries
  } catch {
    return NONE
  }
}

function readRaw(key: string): string | null {
  const held = unsaved.get(key)
  if (held !== undefined) return held
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** The stopped series under `key`, the same object for as long as nothing has changed. */
function snapshot(key: string): StoppedEntries {
  const raw = readRaw(key)
  const kept = caches.get(key)
  if (kept && kept.raw === raw) return kept.entries
  const entries = parse(raw)
  caches.set(key, { raw, entries })
  return entries
}

function commit(key: string, entries: StoppedEntries): void {
  const raw = JSON.stringify(entries)
  try {
    localStorage.setItem(key, raw)
    unsaved.delete(key)
  } catch {
    unsaved.set(key, raw)
  }
  listeners.forEach((listener) => listener())
}

function subscribe(key: string, listener: () => void): () => void {
  listeners.add(listener)
  // Another tab changing the list reaches this one as a storage event.
  const onStorage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

function stop(key: string, seriesKey: string, entry: StoppedEntry): void {
  commit(key, { ...snapshot(key), [seriesKey]: entry })
}

function restore(key: string, seriesKey: string): void {
  commit(key, Object.fromEntries(Object.entries(snapshot(key)).filter(([stopped]) => stopped !== seriesKey)))
}

/** Forgets what was held back after a refused write, so a test starts from the browser's own storage. */
export function resetStoppedSuggestionsForTests(): void {
  unsaved.clear()
  caches.clear()
}

/**
 * The series the signed-in person stopped on this device, with `stop` and `restore`. A stopped series is kept
 * here and not on the server: it is a preference about what to be reminded of, and each device keeps its own, as
 * the dismissals do. It is kept for the person, since the labels name what their ledger holds and the device may
 * be used by someone else.
 */
export function useStoppedSuggestions(): {
  stopped: StoppedEntries & StoppedSeries
  stop: (seriesKey: string, entry: StoppedEntry) => void
  restore: (seriesKey: string) => void
} {
  const key = ownerKey(OWNER_KEYS.stopped, useAccountOwner())
  const subscribeTo = useCallback((listener: () => void) => subscribe(key, listener), [key])
  const current = useCallback(() => snapshot(key), [key])
  const stopped = useSyncExternalStore(subscribeTo, current, () => NONE)
  return useMemo(
    () => ({ stopped, stop: (seriesKey, entry) => stop(key, seriesKey, entry), restore: (seriesKey) => restore(key, seriesKey) }),
    [key, stopped],
  )
}
