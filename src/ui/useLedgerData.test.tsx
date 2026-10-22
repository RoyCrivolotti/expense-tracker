import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HeldLedger } from '../data/ledgerHold'
import { sortedMonths } from '../domain/engine/dates'
import { HYDRATED_DATA_MONTHS, type HydrationPolicy } from '../domain/ledger'
import { adversarialLedger } from '../testing/adversarialLedger'
import { type FakeIndexedDb, installFakeIndexedDb } from '../testing/fakeIndexedDb'
import { comparable, memorySource } from '../testing/ledgerSource'
import { syntheticLedger } from '../testing/syntheticLedger'
import { makeTransaction } from '../testing/factories'
import {
  patchAfterCategoryDelete,
  patchAfterFlagDelete,
  patchAfterInstallmentPlanCreate,
  patchAfterTransactionCreate,
  patchAfterTransactionUpdate,
} from './datasetPatches'
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

  it('tells the caller what was held after a first load and after a refresh that worked, and after nothing else', async () => {
    const source = memorySource(small)
    const onSettled = vi.fn<(held: HeldLedger) => void>()
    const { result } = renderHook(() => useLedgerData(source, { owner: OWNER, onSettled }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(onSettled.mock.calls[0]![0].rowCount).toBe(small.transactions.length)
    act(() => result.current.applyPatch((d) => ({ ...d, settings: { ...d.settings, openingCashCents: 3 } })))
    expect(onSettled).toHaveBeenCalledTimes(1)
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] })
    act(() => result.current.reload())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(onSettled).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('does not tell the caller about a snapshot it fell back on', async () => {
    await withSnapshot()
    setOnline(false)
    const source = memorySource(small)
    const onSettled = vi.fn<(held: HeldLedger) => void>()
    const { result } = renderHook(() => useLedgerData(source, { owner: OWNER, onSettled }))
    await waitFor(() => expect(result.current.fromCache).toBe(true))
    expect(onSettled).not.toHaveBeenCalled()
  })
})

describe('useLedgerData, a read in the background that fails', () => {
  async function ready(policy?: HydrationPolicy) {
    const source = memorySource(big)
    const hook = renderHook(() => useLedgerData(source, policy ? { policy } : undefined))
    await waitFor(() => expect(hook.result.current.status).toBe('ready'))
    return { source, ...hook }
  }

  /** A refresh that works clears the error, which is how the user gets out of it. */
  async function refreshClears(result: { current: ReturnType<typeof useLedgerData> }) {
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.backgroundError).toBeNull(), { timeout: 3000 })
    await waitFor(() => expect(result.current.refreshOutcome).toBe('ok'), { timeout: 3000 })
  }

  it('is null while nothing has failed', async () => {
    const { result } = await ready()
    expect(result.current.backgroundError).toBeNull()
  })

  it('tells the screens when the read after a deleted category fails, and keeps the write it patched in', async () => {
    const { source, result } = await ready()
    const [gone, kept] = result.current.model!.dataset.categories
    const read = source.readReferencePart.bind(source)
    source.readReferencePart = () => Promise.reject(new Error('reference down'))
    act(() => result.current.applyPatch((d) => patchAfterCategoryDelete(d, gone!.id, { reassignedToId: kept!.id })))
    await waitFor(() => expect(result.current.backgroundError).toBe('reference down'))
    expect(result.current.model!.dataset.categories.some((c) => c.id === gone!.id)).toBe(false)
    expect(result.current.status).toBe('ready')
    source.readReferencePart = read
    await refreshClears(result)
  })

  it('tells the screens when the read after an added plan fails', async () => {
    const { source, result } = await ready()
    const read = source.readReferencePart.bind(source)
    source.readReferencePart = () => Promise.reject(new Error('plans down'))
    const plan = {
      id: 9_001,
      description: 'Laptop',
      totalCount: 6,
      amountCents: 1_000,
      accountId: 1,
      categoryId: 1,
      type: 'expense' as const,
      anchorBudgetMonth: months.at(-1)!,
      startInstallmentIndex: 1,
      active: true,
    }
    act(() => result.current.applyPatch((d) => patchAfterInstallmentPlanCreate(d, plan)))
    await waitFor(() => expect(result.current.backgroundError).toBe('plans down'))
    expect(result.current.model!.dataset.installmentPlans.some((p) => p.id === 9_001)).toBe(true)
    source.readReferencePart = read
    await refreshClears(result)
  })

  it('tells the screens when the sums of a month a write moved cannot be read', async () => {
    const { source, result } = await ready(WINDOWED)
    source.readCubePart = () => Promise.reject(new Error('sums down'))
    const added = makeTransaction({ id: 900_001, date: `${months[3]!}-12`, budgetMonth: months[3]!, description: 'Added' })
    act(() => result.current.applyPatch((d) => patchAfterTransactionCreate(d, added)))
    await waitFor(() => expect(result.current.backgroundError).toBe('sums down'))
    expect(result.current.status).toBe('ready')
  })

  it('tells the screens when a receipt list cannot be read', async () => {
    const source = memorySource(small)
    const { result } = renderHook(() => useLedgerData(source))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const id = Number(Object.keys(result.current.model!.attachmentCounts!)[0])
    const read = source.readReceiptsPart.bind(source)
    source.readReceiptsPart = () => Promise.reject(new Error('receipts down'))
    act(() => result.current.model!.ensureReceipts!([id]))
    await waitFor(() => expect(result.current.backgroundError).toBe('receipts down'))
    expect(result.current.status).toBe('ready')
    source.readReceiptsPart = read
    await refreshClears(result)
  })

  it('tells the screens when the rows of the month shown cannot be read, and stops saying the month is loading', async () => {
    const { source, result } = await ready(WINDOWED)
    const read = source.readMonthsPart.bind(source)
    source.readMonthsPart = () => Promise.reject(new Error('months down'))
    act(() => result.current.viewMonth!(months[10]!))
    await waitFor(() => expect(result.current.backgroundError).toBe('months down'))
    expect(result.current.hydrating).toBe(false)
    expect(result.current.status).toBe('ready')
    source.readMonthsPart = read
    await refreshClears(result)
  })
})

describe('useLedgerData, the list read in pages', () => {
  const pageReads = (source: ReturnType<typeof memorySource>) => source.calls.filter((c) => c === 'page').length

  async function started() {
    const source = memorySource(small)
    const hook = renderHook(() => useLedgerData(source))
    await waitFor(() => expect(hook.result.current.status).toBe('ready'))
    const { pager } = hook.result.current.model!.pagedList!
    pager.setFilter({})
    await waitFor(() => expect(pager.getState().rows.length).toBeGreaterThan(0))
    return { source, pager, ...hook }
  }

  it('gives the model a pager that waits for the filter to settle, one read for a burst of keys', async () => {
    const source = memorySource(small)
    const { result } = renderHook(() => useLedgerData(source))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const { pager } = result.current.model!.pagedList!
    for (const query of ['r', 're', 'ren']) pager.setFilter({ query })
    expect(pageReads(source)).toBe(0)
    await waitFor(() => expect(pageReads(source)).toBe(1))
  })

  it('reads the list again after a write that changed rows, and not after one that did not', async () => {
    const { source, pager, result } = await started()
    const before = pageReads(source)
    const target = result.current.model!.dataset.transactions[0]!
    act(() => result.current.applyPatch((d) => patchAfterTransactionUpdate(d, { ...target, description: 'Renamed' })))
    await waitFor(() => expect(pageReads(source)).toBe(before + 1))
    await waitFor(() => expect(pager.getState().summaryStale).toBe(false))
    act(() => result.current.applyPatch((d) => ({ ...d, settings: { ...d.settings, openingCashCents: 4242 } })))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(pageReads(source)).toBe(before + 1)
  })

  it('reads the list and its summary again when the user refreshes', async () => {
    const { source, result } = await started()
    const before = pageReads(source)
    const summaries = source.calls.filter((c) => c === 'summary').length
    act(() => result.current.reload())
    await waitFor(() => expect(pageReads(source)).toBe(before + 1))
    await waitFor(() => expect(source.calls.filter((c) => c === 'summary')).toHaveLength(summaries + 1))
  })

  it('cancels what the pager has in flight when it is unmounted', async () => {
    const source = memorySource(small)
    const { result, unmount } = renderHook(() => useLedgerData(source))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const { pager } = result.current.model!.pagedList!
    pager.setFilter({})
    unmount()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(pager.getState().rows).toEqual([])
  })
})
