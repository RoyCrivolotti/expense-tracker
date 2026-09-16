import { act, renderHook } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { makeDataset, makeFlag, makeTransaction } from '../../testing/factories'
import { buildLookup } from '../format'
import type { ExpenseActions } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { useTransactionsTabState } from './useTransactionsTabState'

const work = makeFlag({ id: 1, name: 'Work travel' })

// useIsMobile reads matchMedia, which jsdom does not implement.
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  })
})

function modelWith(flags = [work]): ExpenseModel {
  const dataset = makeDataset({ flags })
  return {
    dataset,
    lookup: buildLookup(dataset),
    descriptionIndex: { search: () => [], resolve: () => undefined },
    months: [],
  }
}

describe('useTransactionsTabState — flag filter', () => {
  it('keeps a flag filter that still resolves', () => {
    const { result } = renderHook(() => useTransactionsTabState(modelWith(), '2026-05'))

    act(() => result.current.setFlagId(1))

    expect(result.current.flagId).toBe(1)
    expect(result.current.hasActiveFilters).toBe(true)
  })

  it('falls back to "all" when the filtered flag no longer exists', () => {
    // Deleting a flag from the Flagged card's own Manage modal leaves the tab
    // filtered to a dead id; a stored one would show "All flags" in the select
    // while the list rendered nothing.
    const { result, rerender } = renderHook(({ model }) => useTransactionsTabState(model, '2026-05'), {
      initialProps: { model: modelWith() },
    })

    act(() => result.current.setFlagId(1))
    expect(result.current.flagId).toBe(1)

    rerender({ model: modelWith([]) })

    expect(result.current.flagId).toBe('all')
    expect(result.current.hasActiveFilters).toBe(false)
    expect(result.current.secondaryFilterCount).toBe(0)
  })

  it('leaves the unflagged sentinel alone — it names no flag to resolve', () => {
    const { result } = renderHook(() => useTransactionsTabState(modelWith([]), '2026-05'))

    act(() => result.current.setFlagId('none'))

    expect(result.current.flagId).toBe('none')
  })
})

describe('useTransactionsTabState — selection across a filter change', () => {
  function modelWithRows(): ExpenseModel {
    const dataset = makeDataset({
      transactions: [
        makeTransaction({ id: 1, type: 'expense' }),
        makeTransaction({ id: 2, type: 'expense' }),
        makeTransaction({ id: 3, type: 'income' }),
      ],
    })
    return {
      dataset,
      lookup: buildLookup(dataset),
      descriptionIndex: { search: () => [], resolve: () => undefined },
      months: [],
    }
  }

  it('gives a narrowed selection back when the filter widens again', () => {
    // The tab reconciled the selection by deleting whatever a filter hid, so choosing
    // three rows, filtering to expenses and clearing the filter left two chosen.
    const model = modelWithRows()
    const { result } = renderHook(() => useTransactionsTabState(model, '2025-01'))
    act(() => result.current.selectAll(result.current.visibleIds))
    expect(result.current.selected.size).toBe(3)

    act(() => result.current.setTxnType('expense'))
    expect(result.current.selected).toEqual(new Set([1, 2]))
    expect(result.current.hiddenCount).toBe(1)

    act(() => result.current.setTxnType('all'))
    expect(result.current.selected).toEqual(new Set([1, 2, 3]))
    expect(result.current.hiddenCount).toBe(0)
  })
})

describe('useTransactionsTabState — acting on a selection that spans two months', () => {
  // Three rows charged to June, two to May. The question this answers: choose June's
  // rows, step back to May, choose one there, come back and act. What gets touched?
  const JUNE = '2025-06'
  const MAY = '2025-05'

  function twoMonthModel(): ExpenseModel {
    const dataset = makeDataset({
      transactions: [
        makeTransaction({ id: 1, budgetMonth: JUNE, date: '2025-06-03' }),
        makeTransaction({ id: 2, budgetMonth: JUNE, date: '2025-06-04' }),
        makeTransaction({ id: 3, budgetMonth: JUNE, date: '2025-06-05' }),
        makeTransaction({ id: 4, budgetMonth: MAY, date: '2025-05-03' }),
        makeTransaction({ id: 5, budgetMonth: MAY, date: '2025-05-04' }),
      ],
    })
    return {
      dataset,
      lookup: buildLookup(dataset),
      descriptionIndex: { search: () => [], resolve: () => undefined },
      months: [],
    }
  }

  /** The ids a spy was called with, sorted: a bulk action's order means nothing. */
  function idsOf(spy: unknown, call = 0): number[] {
    const ids = (spy as { mock: { calls: unknown[][] } }).mock.calls[call]?.[0] as number[]
    return [...ids].sort((a, b) => a - b)
  }

  function actionsSpy(): ExpenseActions {
    return {
      updateTransactions: vi.fn((ids: number[]) => Promise.resolve(ids.length)),
      deleteTransactions: vi.fn((ids: number[]) => Promise.resolve(ids.length)),
      deleteTransaction: vi.fn(),
    } as unknown as ExpenseActions
  }

  /** June's three chosen, then May's row 4 chosen while June is off screen. */
  function selectAcrossMonths(actions: ExpenseActions) {
    const model = twoMonthModel()
    const hook = renderHook(({ month }) => useTransactionsTabState(model, month, actions), {
      initialProps: { month: JUNE },
    })
    const { result, rerender } = hook
    act(() => result.current.toggleSelectMode())
    act(() => result.current.selectAll(result.current.visibleIds))
    expect(result.current.selected).toEqual(new Set([1, 2, 3]))

    rerender({ month: MAY })
    expect(result.current.selected.size).toBe(0)
    expect(result.current.hiddenCount).toBe(3)

    act(() => result.current.toggleSelected(4))
    expect(result.current.selected).toEqual(new Set([4]))
    expect(result.current.hiddenCount).toBe(3)
    return hook
  }

  it('edits only the rows on screen when you come back: June, not the May row', async () => {
    const actions = actionsSpy()
    const { result, rerender } = selectAcrossMonths(actions)

    rerender({ month: JUNE })
    expect(result.current.selected).toEqual(new Set([1, 2, 3]))
    expect(result.current.hiddenCount).toBe(1)

    await act(async () => {
      await result.current.confirmBulkEdit({ categoryId: 9 })
    })

    expect(actions.updateTransactions).toHaveBeenCalledTimes(1)
    expect(idsOf(actions.updateTransactions)).toEqual([1, 2, 3])
    expect(vi.mocked(actions.updateTransactions).mock.calls[0]?.[1]).toEqual({ categoryId: 9 })
  })

  it('deletes only the rows on screen as well', async () => {
    const actions = actionsSpy()
    const { result, rerender } = selectAcrossMonths(actions)

    rerender({ month: JUNE })
    act(() => result.current.requestBatchDelete())
    await act(async () => {
      await result.current.confirmBatchDelete()
    })

    expect(actions.deleteTransactions).toHaveBeenCalledTimes(1)
    expect(idsOf(actions.deleteTransactions)).toEqual([1, 2, 3])
  })

  it('acting while still in May touches only the May row', async () => {
    const actions = actionsSpy()
    const { result } = selectAcrossMonths(actions)

    await act(async () => {
      await result.current.confirmBulkEdit({ categoryId: 9 })
    })

    expect(idsOf(actions.updateTransactions)).toEqual([4])
  })

  it('finishing an action clears the whole selection, the off-screen part included', async () => {
    // Acting has always ended selection mode. Worth pinning here because the May row was
    // chosen and not acted on, so it is the one a user might expect to survive.
    const actions = actionsSpy()
    const { result, rerender } = selectAcrossMonths(actions)

    rerender({ month: JUNE })
    await act(async () => {
      await result.current.confirmBulkEdit({ categoryId: 9 })
    })
    rerender({ month: MAY })

    expect(result.current.selectMode).toBe(false)
    expect(result.current.selected.size).toBe(0)
    expect(result.current.hiddenCount).toBe(0)
  })
})

describe('useTransactionsTabState — the month arrows and the date scope', () => {
  // Rows in April, May and June, charged to the month they are dated in.
  function threeMonthModel(): ExpenseModel {
    const dataset = makeDataset({
      transactions: [
        makeTransaction({ id: 1, budgetMonth: '2026-04', date: '2026-04-10' }),
        makeTransaction({ id: 2, budgetMonth: '2026-05', date: '2026-05-10' }),
        makeTransaction({ id: 3, budgetMonth: '2026-06', date: '2026-06-10' }),
      ],
    })
    return {
      dataset,
      lookup: buildLookup(dataset),
      descriptionIndex: { search: () => [], resolve: () => undefined },
      months: [],
    }
  }

  function renderAt(month: string, monthNavigation = 0) {
    const model = threeMonthModel()
    return renderHook(
      ({ m, nav }) => useTransactionsTabState(model, m, undefined, { monthNavigation: nav }),
      { initialProps: { m: month, nav: monthNavigation } },
    )
  }

  const shown = (ids: number[]) => [...ids].sort((a, b) => a - b)

  it('shows the month the user moves to, when the list was on all dates', () => {
    const { result, rerender } = renderAt('2026-06')
    act(() => result.current.setDateScope('allDates'))
    expect(shown(result.current.visibleIds)).toEqual([1, 2, 3])

    rerender({ m: '2026-05', nav: 1 })

    expect(result.current.dateScope).toBe('budgetMonth')
    expect(result.current.visibleIds).toEqual([2])
  })

  it('does the same from a custom range, and brings the range back when Custom is chosen again', () => {
    const { result, rerender } = renderAt('2026-06')
    act(() => result.current.setDateScope('custom'))
    act(() => result.current.setCustomDateFrom('2026-04-01'))
    act(() => result.current.setCustomDateTo('2026-05-31'))
    expect(shown(result.current.visibleIds)).toEqual([1, 2])

    rerender({ m: '2026-05', nav: 1 })
    expect(result.current.dateScope).toBe('budgetMonth')
    expect(result.current.visibleIds).toEqual([2])

    act(() => result.current.setDateScope('custom'))
    expect(result.current.dateScope).toBe('custom')
    expect(shown(result.current.visibleIds)).toEqual([1, 2])
  })

  it('keeps sliding the last three months with the arrows, as it always has', () => {
    const { result, rerender } = renderAt('2026-06')
    act(() => result.current.setDateScope('last3Months'))

    rerender({ m: '2026-05', nav: 1 })

    expect(result.current.dateScope).toBe('last3Months')
    expect(shown(result.current.visibleIds)).toEqual([1, 2])
  })

  it('leaves all dates alone when the month changes without the user moving it', () => {
    // A refresh that brings in a newer month moves the active month on its own when none
    // was picked. That is not a request to look at a month.
    const { result, rerender } = renderAt('2026-05')
    act(() => result.current.setDateScope('allDates'))

    rerender({ m: '2026-06', nav: 0 })

    expect(result.current.dateScope).toBe('allDates')
    expect(shown(result.current.visibleIds)).toEqual([1, 2, 3])
  })

  it('keeps the all-dates jump from a flag until the user moves the month', () => {
    // "Show these in the list" sets all dates after any number of earlier moves.
    const { result, rerender } = renderAt('2026-06', 7)
    act(() => result.current.setDateScope('allDates'))
    rerender({ m: '2026-06', nav: 7 })
    expect(result.current.dateScope).toBe('allDates')

    rerender({ m: '2026-05', nav: 8 })
    expect(result.current.dateScope).toBe('budgetMonth')
  })
})
