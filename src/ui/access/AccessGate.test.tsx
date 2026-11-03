/**
 * The access check that does not answer. With the network out, a device that holds a copy of someone's data opens the
 * app on it, read-only, for the person it names; with none it says what happened. Each test visits the app online
 * once, as the person did, and then loses the network or the server, so the copy under test is the one the app
 * wrote itself, in the dataset app and in the ledger app.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LEDGER_MODE_KEY } from '../../config/ledgerMode'
import type { ExpenseDataSource } from '../../data/dataSource'
import { type FakeIndexedDb, installFakeIndexedDb } from '../../testing/fakeIndexedDb'
import { installFakeMatchMedia } from '../../testing/fakeMatchMedia'
import { memorySource } from '../../testing/ledgerSource'
import { syntheticLedger } from '../../testing/syntheticLedger'
import { ToastProvider } from '../hooks/ToastProvider'
import { AccessGate } from './AccessGate'

const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'
const dataset = syntheticLedger({ months: 8, perMonth: 8, seed: 6 })

type Answer =
  | 'allowed'
  | 'rejected'
  | 401
  | 403
  | 503
  | 'down'
  | 'worded like down'
  | 'without Expenses'
  | 'owner without Expenses'
  | 'with Expenses'

/** The groups of a person the server has let in, with or without the one this app is for. */
const groups = (expenses: boolean) => ({ expenses, finance: true, legacy: false, oncall: false })

let idb: FakeIndexedDb
let statusFor: Answer

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })
}

function answer(who: string, kind: Answer): Response | Promise<never> {
  if (kind === 'down') return Promise.reject(new TypeError('Load failed'))
  // An answer whose text reads like a lost connection is still an answer.
  if (kind === 'worded like down') return new Response(JSON.stringify({ error: 'Load failed' }), { status: 503 })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  if (kind === 'without Expenses') return json({ status: 'allowed', email: who, groups: groups(false) })
  if (kind === 'owner without Expenses') return json({ status: 'allowed', email: who, isOwner: true, groups: groups(false) })
  if (kind === 'with Expenses') return json({ status: 'allowed', email: who, groups: groups(true) })
  if (typeof kind === 'number') return json({ error: kind === 503 ? 'Access is not set up' : 'Not allowed' }, kind)
  return json({ status: kind, email: who })
}

beforeEach(() => {
  idb = installFakeIndexedDb()
  installFakeMatchMedia()
  setOnline(true)
  statusFor = 'allowed'
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(answer(ALICE, statusFor))))
})

afterEach(() => {
  idb.uninstall()
  vi.unstubAllGlobals()
  window.localStorage.removeItem(LEDGER_MODE_KEY)
  setOnline(true)
})

function datasetSource(fails = false): ExpenseDataSource & { load: ReturnType<typeof vi.fn> } {
  return {
    canWrite: true,
    load: vi.fn(() => (fails ? Promise.reject(new TypeError('Load failed')) : Promise.resolve(dataset))),
  }
}

function ledgerSource() {
  return Object.assign(memorySource(dataset), { canWrite: true, load: vi.fn().mockResolvedValue(dataset) })
}

const gate = (source: ExpenseDataSource) => (
  <ToastProvider>
    <AccessGate source={source} />
  </ToastProvider>
)

const savedKeys = () => [...(idb.stores.get('snapshots')?.keys() ?? [])]

/**
 * Lets the gate's clean-up run to its end (a lazy import, then a few turns of the store). A copy that is still there
 * afterwards is one the gate left alone, not one it has not got to yet.
 */
async function afterCleanUp() {
  await vi.dynamicImportSettled()
  await idb.settled()
}

/** The person opens the app with a connection, so that it keeps a copy for next time. */
async function visitOnline(source: ExpenseDataSource, key: string) {
  const view = render(gate(source))
  await screen.findByText('Recent activity')
  await waitFor(() => expect(savedKeys()).toContain(key))
  view.unmount()
}

describe('with the network out and a copy saved', () => {
  it('opens the dataset app on the copy, read-only, for the person it names', async () => {
    await visitOnline(datasetSource(), 'latest')
    statusFor = 'down'
    setOnline(false)
    const source = datasetSource()

    render(gate(source))

    expect(await screen.findByText('Recent activity')).toBeInTheDocument()
    expect(screen.getByText("You're offline")).toBeInTheDocument()
    expect(screen.getByText(/Viewing saved data from .*Editing is disabled until you reconnect/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add transaction' })).not.toBeInTheDocument()
    expect(source.load).not.toHaveBeenCalled()
    expect(screen.queryByText('Can’t reach the server')).not.toBeInTheDocument()
  })

  it('opens the ledger app on the ledger’s copy', async () => {
    window.localStorage.setItem(LEDGER_MODE_KEY, 'on')
    await visitOnline(ledgerSource(), `ledger:${ALICE}`)
    statusFor = 'down'
    setOnline(false)
    const source = ledgerSource()

    render(gate(source))

    expect(await screen.findByText('Recent activity')).toBeInTheDocument()
    expect(screen.getByText(/Viewing saved data from .*Editing is disabled until you reconnect/)).toBeInTheDocument()
    expect(source.calls).toEqual([])
  })

  it('opens a browser that reads the ledger on the dataset copy when that is all it has', async () => {
    await visitOnline(datasetSource(), 'latest')
    window.localStorage.setItem(LEDGER_MODE_KEY, 'on')
    statusFor = 'down'
    setOnline(false)

    render(gate(ledgerSource()))

    expect(await screen.findByText('Recent activity')).toBeInTheDocument()
    expect(screen.getByText(/Viewing saved data from/)).toBeInTheDocument()
  })

  it('does not open a dataset browser on a copy only the ledger can read', async () => {
    window.localStorage.setItem(LEDGER_MODE_KEY, 'on')
    await visitOnline(ledgerSource(), `ledger:${ALICE}`)
    window.localStorage.removeItem(LEDGER_MODE_KEY)
    statusFor = 'down'
    setOnline(false)

    render(gate(datasetSource(true)))

    expect(await screen.findByRole('heading', { name: 'You’re offline' })).toBeInTheDocument()
    expect(screen.queryByText('Recent activity')).not.toBeInTheDocument()
  })

  it('opens it too when the browser says it is online but the server does not answer, and says so', async () => {
    await visitOnline(datasetSource(), 'latest')
    statusFor = 'down'

    render(gate(datasetSource(true)))

    expect(await screen.findByText('Recent activity')).toBeInTheDocument()
    expect(screen.getByText('Showing saved data')).toBeInTheDocument()
    expect(screen.getByText(/Couldn't reach the server .*Editing is disabled until then/)).toBeInTheDocument()
  })

  it('does not open it for no one when the copies name two people', async () => {
    await visitOnline(datasetSource(), 'latest')
    window.localStorage.setItem(LEDGER_MODE_KEY, 'on')
    statusFor = 'down'
    setOnline(false)
    await new Promise<void>((resolve) => {
      const request = indexedDB.open('expense-tracker-offline', 1)
      request.onsuccess = () => {
        const tx = request.result.transaction('snapshots', 'readwrite')
        tx.objectStore('snapshots').put({ key: `ledger:${BOB}`, version: 9, owner: BOB })
        tx.oncomplete = () => resolve()
      }
    })

    render(gate(ledgerSource()))

    expect(await screen.findByRole('heading', { name: 'You’re offline' })).toBeInTheDocument()
    expect(screen.queryByText('Recent activity')).not.toBeInTheDocument()
  })
})

describe('with the network out and a store that does not answer', () => {
  afterEach(() => vi.useRealTimers())

  it('says the person is offline after three seconds, with Try again, and not Checking access for ever', async () => {
    await visitOnline(datasetSource(), 'latest')
    idb.hangOpen()
    statusFor = 'down'
    setOnline(false)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    render(gate(datasetSource(true)))
    await act(() => vi.dynamicImportSettled())
    await act(() => vi.advanceTimersByTimeAsync(2999))
    expect(screen.getByText('Checking access')).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(1))

    expect(screen.getByRole('heading', { name: 'You’re offline' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
  })
})

describe('with the network out and no copy', () => {
  it('says the person is offline and offers Try again, which opens the app once there is a connection', async () => {
    statusFor = 'down'
    setOnline(false)
    render(gate(datasetSource()))

    expect(await screen.findByRole('heading', { name: 'You’re offline' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()

    statusFor = 'allowed'
    setOnline(true)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Recent activity')).toBeInTheDocument()
  })

  it('keeps today’s wording and Sign in while the browser thinks it is online', async () => {
    statusFor = 'down'
    render(gate(datasetSource()))

    expect(await screen.findByRole('heading', { name: 'Can’t reach the server' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })
})

describe('when the server answers', () => {
  it.each([401, 403, 503] as const)('shows the screen for a %i whatever the device holds', async (code) => {
    await visitOnline(datasetSource(), 'latest')
    statusFor = code
    setOnline(false)

    render(gate(datasetSource(true)))

    expect(await screen.findByRole('heading', { name: 'Couldn’t check access' })).toBeInTheDocument()
    expect(screen.queryByText('Recent activity')).not.toBeInTheDocument()
    // A 401 or a 403 is a refusal, so what the device kept is dropped; a 503 is the server failing, which says nothing about the person.
    await waitFor(() => expect(savedKeys()).toEqual(code === 503 ? ['latest'] : []))
  })

  it('tells an answer from a lost connection by what happened and not by its words', async () => {
    await visitOnline(datasetSource(), 'latest')
    statusFor = 'worded like down'
    setOnline(false)

    render(gate(datasetSource(true)))

    expect(await screen.findByRole('heading', { name: 'You’re offline' })).toBeInTheDocument()
    expect(screen.queryByText('Recent activity')).not.toBeInTheDocument()
    expect(savedKeys()).toEqual(['latest'])
  })

  it('drops every copy, the ledger’s too, for a person it refuses', async () => {
    window.localStorage.setItem(LEDGER_MODE_KEY, 'on')
    await visitOnline(ledgerSource(), `ledger:${ALICE}`)
    statusFor = 'rejected'

    render(gate(ledgerSource()))

    await screen.findByText(ALICE)
    await waitFor(() => expect(savedKeys()).toEqual([]))
    expect(screen.queryByText('Recent activity')).not.toBeInTheDocument()
  })

  it('drops every copy, the ledger’s too, for a person who is allowed but has no Expenses group', async () => {
    window.localStorage.setItem(LEDGER_MODE_KEY, 'on')
    await visitOnline(ledgerSource(), `ledger:${ALICE}`)
    statusFor = 'without Expenses'

    render(gate(ledgerSource()))

    expect(await screen.findByRole('heading', { name: 'No expense tracker access' })).toBeInTheDocument()
    await waitFor(() => expect(savedKeys()).toEqual([]))
  })

  // The source cannot load, so the app shows only what the device kept: the copy is still there if it opens on it,
  // and nothing puts it back if it does not.
  it.each(['owner without Expenses', 'with Expenses'] as const)('keeps the copy for %s', async (kind) => {
    await visitOnline(datasetSource(), 'latest')
    statusFor = kind

    render(gate(datasetSource(true)))

    expect(await screen.findByText('Recent activity')).toBeInTheDocument()
    await afterCleanUp()
    expect(savedKeys()).toEqual(['latest'])
  })

  it('opens the app as before when the person is allowed, and keeps the copy', async () => {
    await visitOnline(datasetSource(), 'latest')

    render(gate(datasetSource()))

    expect(await screen.findByText('Recent activity')).toBeInTheDocument()
    expect(screen.queryByText('Showing saved data')).not.toBeInTheDocument()
    // The control for the read-only test above: with the server in reach the same source can add.
    expect(screen.getByRole('button', { name: 'Add transaction' })).toBeInTheDocument()
    expect(savedKeys()).toEqual(['latest'])
  })
})
