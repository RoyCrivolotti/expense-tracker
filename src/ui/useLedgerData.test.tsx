import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sortedMonths } from '../domain/engine/dates'
import { HYDRATED_DATA_MONTHS, type HydrationPolicy } from '../domain/ledger'
import { adversarialLedger } from '../testing/adversarialLedger'
import { type FakeIndexedDb, installFakeIndexedDb } from '../testing/fakeIndexedDb'
import { comparable, memorySource } from '../testing/ledgerSource'
import { syntheticLedger } from '../testing/syntheticLedger'
import { patchAfterFlagDelete, patchAfterTransactionUpdate } from './datasetPatches'
import { buildExpenseModel } from './buildExpenseModel'
import { useLedgerData } from './useLedgerData'

const WINDOWED: HydrationPolicy = { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS }
const small = syntheticLedger({ months: 12, perMonth: 10, seed: 1 })
const big = adversarialLedger()
const months = sortedMonths(big.transactions.map((t) => t.budgetMonth))

afterEach(() => {
  vi.useRealTimers()
})

describe('useLedgerData', () => {
  it('loads, and gives the screens the model buildExpenseModel makes from the whole dataset', async () => {
    const source = memorySource(small)
    const { result } = renderHook(() => useLedgerData(source))
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const whole = buildExpenseModel(small)
    expect(comparable(result.current.model!.dataset.transactions)).toEqual(comparable(whole.dataset.transactions))
    expect(result.current.model!.months).toEqual(whole.months)
    expect(result.current.fromCache).toBe(false)
    expect(result.current.model!.sums).toBeUndefined()
  })

  it('reports a load that fails, and loads again when asked to retry', async () => {
    const source = memorySource(small)
    const read = source.readReferencePart.bind(source)
    source.readReferencePart = vi.fn().mockRejectedValueOnce(new Error('down')).mockImplementation(read)
    const { result } = renderHook(() => useLedgerData(source))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBe('down')
    act(() => result.current.reload())
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.error).toBeUndefined()
  })

  it('shows a write at once', async () => {
    const source = memorySource(small)
    const { result } = renderHook(() => useLedgerData(source))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const target = result.current.model!.dataset.transactions[0]!
    act(() => result.current.applyPatch((d) => patchAfterTransactionUpdate(d, { ...target, description: 'Renamed' })))
    expect(result.current.model!.dataset.transactions.find((t) => t.id === target.id)!.description).toBe('Renamed')
  })

  it('reads the ledger again after a write the server answered with more than the patch shows', async () => {
    const source = memorySource(big)
    const { result } = renderHook(() => useLedgerData(source, { policy: WINDOWED }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const flagId = result.current.model!.dataset.flags[0]!.id
    source.calls.length = 0
    act(() => result.current.applyPatch((d) => patchAfterFlagDelete(d, flagId)))
    await waitFor(() => expect(source.calls.filter((c) => c === 'reference')).toHaveLength(1))
  })

  it('reads the rows of the month shown when it changes, with hydrating on while it does', async () => {
    const source = memorySource(big)
    const { result } = renderHook(() => useLedgerData(source, { policy: WINDOWED }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const month = months[10]!
    const before = result.current.model!.dataset.transactions.filter((t) => t.budgetMonth === month).length
    act(() => result.current.viewMonth!(month))
    const sawHydrating = result.current.hydrating === true
    await waitFor(() => expect(result.current.hydrating).toBe(false))
    expect(sawHydrating).toBe(true)
    const after = result.current.model!.dataset.transactions.filter((t) => t.budgetMonth === month).length
    expect(after).toBe(big.transactions.filter((t) => t.budgetMonth === month).length)
    expect(after).toBeGreaterThanOrEqual(before)
    expect(result.current.model!.sums).toBeDefined()
  })

  it('refreshes on request, holding the refresh state for a moment so it can be seen, and reports the outcome', async () => {
    const source = memorySource(small)
    const { result } = renderHook(() => useLedgerData(source))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] })
    act(() => result.current.reload())
    expect(result.current.refreshing).toBe(true)
    expect(result.current.refreshOutcome).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(result.current.refreshing).toBe(false)
    expect(result.current.refreshOutcome).toBe('ok')
  })

  it('reports a refresh that fails, and keeps the model', async () => {
    const source = memorySource(small)
    const { result } = renderHook(() => useLedgerData(source))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const model = result.current.model
    source.readReferencePart = () => Promise.reject(new Error('offline'))
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] })
    act(() => result.current.reload())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(result.current.refreshOutcome).toBe('fail')
    expect(result.current.status).toBe('ready')
    expect(result.current.model).toBe(model)
  })

  it('does not set state after it is unmounted', async () => {
    const source = memorySource(small)
    const { unmount } = renderHook(() => useLedgerData(source))
    unmount()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(source.calls.length).toBeGreaterThan(0)
  })

  it('has the receipt counts but no receipt lists until a screen asks, then reads them', async () => {
    const source = memorySource(small)
    const { result } = renderHook(() => useLedgerData(source))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const model = result.current.model!
    const ids = [...new Set(small.attachments.map((a) => a.transactionId))]
    expect(model.dataset.attachments).toEqual([])
    expect(model.receiptsPending).toBe(ids.length)
    expect(model.lookup.attachmentCount(ids[0]!)).toBe(small.attachments.filter((a) => a.transactionId === ids[0]).length)
    expect(model.lookup.attachments(ids[0]!)).toEqual([])
    act(() => model.ensureReceipts!([ids[0]!]))
    await waitFor(() => expect(result.current.model!.lookup.attachments(ids[0]!)).toHaveLength(small.attachments.filter((a) => a.transactionId === ids[0]).length))
    expect(result.current.model!.receiptsPending).toBe(ids.length - 1)
    act(() => result.current.model!.ensureReceipts!(ids))
    await waitFor(() => expect(result.current.model!.receiptsPending).toBe(0))
    expect(result.current.model!.dataset.attachments).toHaveLength(small.attachments.length)
  })
})

describe('useLedgerData, snapshots', () => {
  let fake: FakeIndexedDb
  const OWNER = 'alex@example.com'
  const keys = () => [...(fake.stores.get('snapshots')?.keys() ?? [])]

  /** jsdom has no navigator.onLine setter; replace just that property. */
  function setOnline(online: boolean) {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })
  }

  beforeEach(() => {
    fake = installFakeIndexedDb()
    setOnline(true)
  })

  afterEach(() => {
    fake.uninstall()
    setOnline(true)
  })

  /** Opens once online so that a snapshot of `small` exists for the owner. */
  async function withSnapshot(owner = OWNER) {
    const source = memorySource(small)
    const first = renderHook(() => useLedgerData(source, { owner }))
    await waitFor(() => expect(first.result.current.status).toBe('ready'))
    await waitFor(() => expect(keys()).toContain(`ledger:${owner}`))
    first.unmount()
  }

  it('keeps the owner’s snapshot once a load works, and none without an owner', async () => {
    const source = memorySource(small)
    const { result } = renderHook(() => useLedgerData(source, { owner: OWNER }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await waitFor(() => expect(keys()).toEqual([`ledger:${OWNER}`]))
    fake.stores.clear()
    const bare = memorySource(small)
    const anonymous = renderHook(() => useLedgerData(bare))
    await waitFor(() => expect(anonymous.result.current.status).toBe('ready'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(keys()).toEqual([])
  })

  it('shows the snapshot, read-only, when offline, without reading anything', async () => {
    await withSnapshot()
    setOnline(false)
    const source = memorySource(small)
    const { result } = renderHook(() => useLedgerData(source, { owner: OWNER }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.fromCache).toBe(true)
    expect(result.current.snapshotAt).toBeDefined()
    expect(source.calls).toEqual([])
    expect(comparable(result.current.model!.dataset.transactions)).toEqual(comparable(buildExpenseModel(small).dataset.transactions))
    const before = result.current.model
    act(() => result.current.applyPatch((d) => ({ ...d, settings: { ...d.settings, openingCashCents: 1 } })))
    expect(result.current.model).toBe(before)
  })

  it('says so when offline with no snapshot, and for another owner’s snapshot', async () => {
    setOnline(false)
    const empty = memorySource(small)
    const none = renderHook(() => useLedgerData(empty, { owner: OWNER }))
    await waitFor(() => expect(none.result.current.status).toBe('error'))
    expect(none.result.current.error).toBe('You are offline and no saved data is available.')
    none.unmount()
    setOnline(true)
    await withSnapshot('sam@example.com')
    setOnline(false)
    const other = memorySource(small)
    const foreign = renderHook(() => useLedgerData(other, { owner: OWNER }))
    await waitFor(() => expect(foreign.result.current.status).toBe('error'))
  })

  it('shows the snapshot when a load fails online, and the failure when there is none', async () => {
    const down = memorySource(small)
    down.readReferencePart = () => Promise.reject(new Error('down'))
    const bare = renderHook(() => useLedgerData(down, { owner: OWNER }))
    await waitFor(() => expect(bare.result.current.status).toBe('error'))
    expect(bare.result.current.error).toBe('down')
    bare.unmount()
    await withSnapshot()
    const fallback = renderHook(() => useLedgerData(down, { owner: OWNER }))
    await waitFor(() => expect(fallback.result.current.status).toBe('ready'))
    expect(fallback.result.current.fromCache).toBe(true)
  })

  it('leaves the snapshot when a refresh reads, and keeps the new ledger as the snapshot', async () => {
    await withSnapshot()
    setOnline(false)
    const source = memorySource(small)
    const { result } = renderHook(() => useLedgerData(source, { owner: OWNER }))
    await waitFor(() => expect(result.current.fromCache).toBe(true))
    setOnline(true)
    const before = (fake.stores.get('snapshots')!.get(`ledger:${OWNER}`) as { savedAt: string }).savedAt
    await new Promise((resolve) => setTimeout(resolve, 5))
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] })
    act(() => result.current.reload())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    vi.useRealTimers()
    expect(result.current.fromCache).toBe(false)
    expect(result.current.refreshOutcome).toBe('ok')
    await waitFor(() => expect((fake.stores.get('snapshots')!.get(`ledger:${OWNER}`) as { savedAt: string }).savedAt).not.toBe(before))
  })

  it('does not turn a load that worked into one that failed when the snapshot cannot be written', async () => {
    fake.failNext('put')
    const source = memorySource(small)
    const { result } = renderHook(() => useLedgerData(source, { owner: OWNER }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.fromCache).toBe(false)
  })
})
