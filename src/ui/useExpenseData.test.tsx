import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset } from '../types'
import type { ExpenseDataSource } from '../data/dataSource'
import { defaultExpenseSettings } from '../engine'
import { loadOfflineSnapshot, saveOfflineSnapshot } from '../data/offlineCache'
import { useExpenseData } from './useExpenseData'

vi.mock('../data/offlineCache', () => ({
  loadOfflineSnapshot: vi.fn().mockResolvedValue(null),
  saveOfflineSnapshot: vi.fn().mockResolvedValue(undefined),
}))

const mockedLoadSnapshot = vi.mocked(loadOfflineSnapshot)
const mockedSaveSnapshot = vi.mocked(saveOfflineSnapshot)

/** jsdom has no navigator.onLine setter; replace just that property. */
function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })
}

const emptyDataset: ExpenseDataset = {
  flags: [],
  attachments: [],
  categories: [],
  accounts: [],
  transactions: [],
  accountStatements: [],
  cashActuals: [],
  goalInputs: {
    housePriceCents: 0,
    downPaymentFraction: 0,
    mortgageTermYears: 0,
    mortgageRateAnnual: 0,
    longTermTargetCents: 0,
    horizonYears: 0,
    expectedRealReturn: 0,
  },
  goalScenarios: [],
  installmentPlans: [],
  wealthAccounts: [],
  wealthCheckins: [],
  settings: defaultExpenseSettings(),
}

describe('useExpenseData', () => {
  it('loads the dataset from the source', async () => {
    const load = vi.fn().mockResolvedValue(emptyDataset)
    const source: ExpenseDataSource = { canWrite: false, load }
    const { result } = renderHook(() => useExpenseData(source))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(load).toHaveBeenCalledOnce()
    expect(result.current.model?.dataset).toEqual(emptyDataset)
  })

  it('applyPatch rebuilds the model without reloading', async () => {
    const load = vi.fn().mockResolvedValue(emptyDataset)
    const source: ExpenseDataSource = { canWrite: false, load }
    const { result } = renderHook(() => useExpenseData(source))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    result.current.applyPatch((d) => ({
      ...d,
      settings: { ...d.settings, openingCashCents: 999 },
    }))
    await waitFor(() =>
      expect(result.current.model?.dataset.settings.openingCashCents).toBe(999),
    )
    expect(load).toHaveBeenCalledOnce()
  })
})

describe('useExpenseData — a refresh must not revert a mutation', () => {
  // vitest's clearMocks defaults to false here and src/test/setup.ts does not clear,
  // so the module-level vi.fn()s below would otherwise accumulate calls across tests.
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /** A source whose load() resolves only when the test says so. */
  function deferredSource() {
    let release: (d: ExpenseDataset) => void = () => {}
    const load = vi.fn(
      () =>
        new Promise<ExpenseDataset>((resolve) => {
          release = resolve
        }),
    )
    const source: ExpenseDataSource = { canWrite: false, load }
    return { source, load, release: (d: ExpenseDataset) => release(d) }
  }

  it('discards a load that resolves after a patch landed', async () => {
    const { source, release } = deferredSource()
    const { result } = renderHook(() => useExpenseData(source))
    // First load settles so the hook reaches 'ready' and patches can apply.
    release(emptyDataset)
    await waitFor(() => expect(result.current.status).toBe('ready'))

    result.current.reload()
    await waitFor(() => expect(result.current.refreshing).toBe(true))

    // The edit lands while the refresh is still in flight.
    result.current.applyPatch((d) => ({
      ...d,
      settings: { ...d.settings, openingCashCents: 999 },
    }))
    await waitFor(() => expect(result.current.model?.dataset.settings.openingCashCents).toBe(999))

    // The refresh now returns pre-mutation server state. It must be dropped.
    release(emptyDataset)
    await waitFor(() => expect(result.current.refreshing).toBe(false))
    expect(result.current.model?.dataset.settings.openingCashCents).toBe(999)
  })

  it('still applies a refresh when no patch landed while it ran', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(emptyDataset)
      .mockResolvedValue({ ...emptyDataset, settings: { ...emptyDataset.settings, openingCashCents: 42 } })
    const source: ExpenseDataSource = { canWrite: false, load }
    const { result } = renderHook(() => useExpenseData(source))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    result.current.reload()

    await waitFor(() => expect(result.current.model?.dataset.settings.openingCashCents).toBe(42))
  })

  it('does not poison later refreshes once an earlier patch has settled', async () => {
    // The failure mode this pins: capturing the counter once (at mount, or in a ref
    // initialised outside load()) instead of per call. That passes the two tests above
    // and permanently stops the app refreshing after the user's first edit — strictly
    // worse than the bug being fixed.
    const load = vi
      .fn()
      .mockResolvedValueOnce(emptyDataset)
      .mockResolvedValue({ ...emptyDataset, settings: { ...emptyDataset.settings, openingCashCents: 7 } })
    const source: ExpenseDataSource = { canWrite: false, load }
    const { result } = renderHook(() => useExpenseData(source))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    result.current.applyPatch((d) => ({
      ...d,
      settings: { ...d.settings, openingCashCents: 999 },
    }))
    await waitFor(() => expect(result.current.model?.dataset.settings.openingCashCents).toBe(999))

    result.current.reload()

    await waitFor(() => expect(result.current.model?.dataset.settings.openingCashCents).toBe(7))
  })
})


describe('useExpenseData — offline and error paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedLoadSnapshot.mockResolvedValue(null)
    mockedSaveSnapshot.mockResolvedValue(undefined)
    setOnline(true)
  })

  afterEach(() => {
    setOnline(true)
  })

  it('shows the cached snapshot when offline', async () => {
    setOnline(false)
    mockedLoadSnapshot.mockResolvedValue({ dataset: emptyDataset, savedAt: '2026-01-01T00:00:00Z' })
    const load = vi.fn()
    const source: ExpenseDataSource = { canWrite: false, load }

    const { result } = renderHook(() => useExpenseData(source))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.fromCache).toBe(true)
    expect(result.current.snapshotAt).toBe('2026-01-01T00:00:00Z')
    expect(load).not.toHaveBeenCalled()
  })

  it('errors when offline with no snapshot', async () => {
    setOnline(false)
    const source: ExpenseDataSource = { canWrite: false, load: vi.fn() }

    const { result } = renderHook(() => useExpenseData(source))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toMatch(/offline/i)
  })

  it('falls back to the cached snapshot when the load fails', async () => {
    mockedLoadSnapshot.mockResolvedValue({ dataset: emptyDataset, savedAt: '2026-02-02T00:00:00Z' })
    const source: ExpenseDataSource = { canWrite: false, load: vi.fn().mockRejectedValue(new Error('boom')) }

    const { result } = renderHook(() => useExpenseData(source))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.fromCache).toBe(true)
  })

  it('surfaces the error when the load fails and there is no snapshot', async () => {
    const source: ExpenseDataSource = { canWrite: false, load: vi.fn().mockRejectedValue(new Error('boom')) }

    const { result } = renderHook(() => useExpenseData(source))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBe('boom')
  })

  it('reports no outcome for a refresh it threw away', async () => {
    // The response arrived fine, it was just superseded by an edit made while it was
    // in flight, so nothing on screen changed. Reporting 'ok' here put an "Updated"
    // toast on a screen that had not updated.
    let release: (v: ExpenseDataset) => void = () => {}
    const load = vi
      .fn()
      .mockResolvedValueOnce(emptyDataset)
      .mockImplementationOnce(() => new Promise<ExpenseDataset>((r) => { release = r }))
    const source: ExpenseDataSource = { canWrite: false, load }
    const { result } = renderHook(() => useExpenseData(source))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => { result.current.reload() })
    await waitFor(() => expect(result.current.refreshing).toBe(true))
    // The edit lands first; the in-flight response is stale from here on.
    act(() => { result.current.applyPatch((d) => d) })
    await act(async () => {
      release(emptyDataset)
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.refreshing).toBe(false))
    expect(result.current.refreshOutcome).toBeNull()
  })

  it('keeps the model a failed refresh cannot replace', async () => {
    const load = vi.fn().mockResolvedValueOnce(emptyDataset).mockRejectedValue(new Error('offline blip'))
    const source: ExpenseDataSource = { canWrite: false, load }
    const { result } = renderHook(() => useExpenseData(source))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    result.current.reload()

    await waitFor(() => expect(result.current.refreshOutcome).toBe('fail'))
    // Already had data, so the failure must not blank the screen.
    expect(result.current.status).toBe('ready')
  })
})
