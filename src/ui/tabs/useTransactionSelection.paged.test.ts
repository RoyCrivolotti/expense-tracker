import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { MatchingTarget } from '../../data/dataSource'
import type { ExpenseActions } from '../actions'
import { ToastContext } from '../hooks/useToast'
import type { PagedSelection } from './useMatchingSelection'
import { useTransactionSelection } from './useTransactionSelection'

const target: MatchingTarget = { filter: { categoryId: 4 }, expectedCount: 342, expectedRevision: 'r9' }
const LOADED = [1, 2, 3]

function actionsOf(overrides: Partial<ExpenseActions> = {}): ExpenseActions {
  return {
    deleteTransactions: vi.fn((ids: number[]) => Promise.resolve(ids.length)),
    updateTransactions: vi.fn((ids: number[]) => Promise.resolve(ids.length)),
    addLabels: vi.fn((ids: number[]) => Promise.resolve(ids.length)),
    updateMatching: vi.fn((t: MatchingTarget) => Promise.resolve(t.expectedCount)),
    setTransactionLabels: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ExpenseActions
}

function render(actions: ExpenseActions, initial: PagedSelection | undefined, existingIds?: number[]) {
  const showToast = vi.fn()
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(ToastContext.Provider, { value: { showToast } }, children)
  const hook = renderHook(
    ({ paged }: { paged: PagedSelection | undefined }) =>
      useTransactionSelection(actions, LOADED, existingIds, undefined, [], paged),
    { wrapper, initialProps: { paged: initial } },
  )
  return { ...hook, showToast }
}

const offered = (matching: MatchingTarget | null = target, filterKey = 'a'): PagedSelection => ({ matching, filterKey })

describe('a selection over a list that does not hold every row', () => {
  it('counts a chosen row the list does not show as hidden, because it may be one nobody has read', () => {
    const { result } = render(actionsOf(), undefined)
    act(() => result.current.selectAll([1, 2, 99]))

    expect(result.current.selected.size).toBe(3 - 1)
    expect(result.current.hiddenCount).toBe(1)
  })

  it('lets go of a chosen row that is gone only when the list holds every row and says so', () => {
    const { result } = render(actionsOf(), undefined, [1, 2, 3])
    act(() => result.current.selectAll([1, 2, 99]))

    expect(result.current.hiddenCount).toBe(0)
  })
})

describe('choosing every row a filter matches', () => {
  it('counts the rows the filter matches and not the ones the list holds', () => {
    const { result } = render(actionsOf(), offered())
    act(() => result.current.toggleSelectMode())

    act(() => result.current.selectMatching())

    expect(result.current.selectedCount).toBe(342)
    expect(result.current.allMatching).toEqual(target)
    expect(result.current.selected.size).toBe(3)
  })

  it('edits them through the filter with the count and revision it was shown, and says how many it changed', async () => {
    const actions = actionsOf()
    const { result, showToast } = render(actions, offered())
    act(() => result.current.selectMatching())

    await act(() => result.current.confirmBulkEdit({ categoryId: 7 }, [5]))

    expect(actions.updateMatching).toHaveBeenCalledWith(target, { categoryId: 7 }, [5])
    expect(actions.updateTransactions).not.toHaveBeenCalled()
    expect(actions.addLabels).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith('Updated 342 transactions', 'success')
    expect(result.current.selectMode).toBe(false)
  })

  it('keeps the count it was shown while the list reads again, because the server checks that count', async () => {
    const actions = actionsOf()
    const { result, rerender } = render(actions, offered())
    act(() => result.current.selectMatching())

    rerender({ paged: offered({ ...target, expectedCount: 340, expectedRevision: 'r10' }) })
    await act(() => result.current.confirmBulkEdit({ categoryId: 7 }))

    expect(actions.updateMatching).toHaveBeenCalledWith(target, { categoryId: 7 }, [])
  })

  it('ends when the filter changes, back to the rows the list holds', () => {
    const { result, rerender } = render(actionsOf(), offered())
    act(() => result.current.selectMatching())

    rerender({ paged: offered(null, 'b') })

    expect(result.current.allMatching).toBeNull()
    expect(result.current.selectedCount).toBe(3)
  })

  it.each([
    ['unticking a row', (r: ReturnType<typeof render>['result']) => r.current.toggleSelected(1)],
    ['clearing', (r: ReturnType<typeof render>['result']) => r.current.deselectAll()],
    ['choosing the rows on screen', (r: ReturnType<typeof render>['result']) => r.current.selectAll(LOADED)],
  ])('ends on %s, because no filter names the rows that are left', (_name, act1) => {
    const { result } = render(actionsOf(), offered())
    act(() => result.current.selectMatching())

    act(() => act1(result))

    expect(result.current.allMatching).toBeNull()
  })

  it('cannot be deleted, because a delete names its rows', () => {
    const actions = actionsOf()
    const { result } = render(actions, offered())
    act(() => result.current.selectMatching())

    act(() => result.current.requestBatchDelete())

    expect(result.current.pendingBatchDelete).toBe(false)
  })

  it('is let go of, and the sheet closed, when the server refuses it, because the count it was shown cannot be trusted', async () => {
    const refused = new Error('The ledger changed since you looked at these transactions. Nothing was changed; look again and retry')
    const actions = actionsOf({ updateMatching: vi.fn().mockRejectedValue(refused) })
    const { result, showToast } = render(actions, offered())
    act(() => result.current.toggleSelectMode())
    act(() => result.current.selectMatching())
    act(() => result.current.requestBulkEdit())

    await act(() => result.current.confirmBulkEdit({ categoryId: 7 }))

    expect(showToast).toHaveBeenCalledWith(refused.message, 'error')
    expect(result.current.allMatching).toBeNull()
    expect(result.current.pendingBulkEdit).toBe(false)
    expect(result.current.selectMode).toBe(true)
  })

  it('adds labels alone through the filter too', async () => {
    const actions = actionsOf()
    const { result } = render(actions, offered())
    act(() => result.current.selectMatching())

    await act(() => result.current.confirmBulkEdit({}, [5]))

    expect(actions.updateMatching).toHaveBeenCalledWith(target, {}, [5])
  })
})

describe('labels added to the rows chosen one by one on a list read in pages', () => {
  it('go through the bulk route and keep the labels the rows have, which are not all held here', async () => {
    const actions = actionsOf()
    const { result } = render(actions, offered(null))
    act(() => result.current.selectAll([1, 2]))

    await act(() => result.current.confirmBulkEdit({ categoryId: 7 }, [5]))

    expect(actions.updateTransactions).toHaveBeenCalledWith([1, 2], { categoryId: 7 })
    expect(actions.addLabels).toHaveBeenCalledWith([1, 2], [5])
    expect(actions.setTransactionLabels).not.toHaveBeenCalled()
  })

  it('go one row at a time on a list that holds every row, as they always did', async () => {
    const actions = actionsOf()
    const { result } = render(actions, undefined)
    act(() => result.current.selectAll([1, 2]))

    await act(() => result.current.confirmBulkEdit({}, [5]))

    expect(actions.addLabels).not.toHaveBeenCalled()
    expect(actions.setTransactionLabels).toHaveBeenCalledTimes(2)
  })
})
