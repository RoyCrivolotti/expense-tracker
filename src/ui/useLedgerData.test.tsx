import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sortedMonths } from '../domain/engine/dates'
import { HYDRATED_DATA_MONTHS, type HydrationPolicy } from '../domain/ledger'
import { adversarialLedger } from '../testing/adversarialLedger'
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
    let sawHydrating = false
    act(() => result.current.viewMonth!(month))
    sawHydrating = result.current.hydrating === true
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
})
