import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { MatchingTarget } from '../data/dataSource'
import type { ExpenseActions } from './actions'
import { ToastContext } from './hooks/useToast'
import { usePagedSelection } from './pagedSelection'
import type { ListView, SelectionView } from './transactionListView'
import type { ExpenseModel } from './useExpenseData'

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

interface ViewOptions {
  matching?: MatchingTarget | null
  partial?: boolean
  /** The ids the model holds, when it holds every row; a model that holds a window has `sums`. */
  held?: number[]
  filter?: object
}

function viewOf({ matching = target, partial = true, held, filter = { categoryId: 4 } }: ViewOptions = {}): SelectionView {
  const dataset = { transactions: (held ?? []).map((id) => ({ id })) }
  const model = { dataset, ...(held === undefined ? { sums: dataset } : {}) } as unknown as ExpenseModel
  return { model, list: { matching, partial } as ListView, filter }
}

function render(actions: ExpenseActions, view: SelectionView = viewOf()) {
  const showToast = vi.fn()
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(ToastContext.Provider, { value: { showToast } }, children)
  const hook = renderHook(({ view: now }: { view: SelectionView }) => usePagedSelection(actions, LOADED, [], undefined, [], now), {
    wrapper,
    initialProps: { view },
  })
  return { ...hook, showToast }
}
type Rendered = ReturnType<typeof render>['result']

/** Select mode on, everything the list holds chosen, as the select button does it. */
function enter(result: Rendered) {
  act(() => result.current.toggleSelectMode())
  act(() => result.current.selectAll(LOADED))
}

describe('a selection over a list that holds only some of the rows', () => {
  it('counts a chosen row the list does not show as not shown, because it may be one nobody has read', () => {
    const { result } = render(actionsOf())
    act(() => result.current.selectAll([1, 2, 99]))

    expect(result.current.selected.size).toBe(2)
    expect(result.current.hiddenCount).toBe(1)
  })

  it('lets go of a chosen row that is gone only when the model holds every row and says so', () => {
    const { result } = render(actionsOf(), viewOf({ held: [1, 2, 3] }))
    act(() => result.current.selectAll([1, 2, 99]))

    expect(result.current.hiddenCount).toBe(0)
  })
})

describe('the select button, which goes on to every row the filter matches', () => {
  it('offers them once every row the list holds is chosen and more match', () => {
    const { result } = render(actionsOf())
    enter(result)

    expect(result.current.bar).toEqual({ allLabel: 'Select all 342', matching: true })
  })

  it.each([
    ['some of the rows the list holds are not chosen', { partial: true }, [1, 2]],
    ['the list holds every row there is', { partial: false }, LOADED],
    ['no more match than the list holds', { matching: { ...target, expectedCount: 3 } }, LOADED],
    ['the count is not one an edit may reach, or is being read again', { matching: null }, LOADED],
  ])('does not offer them when %s', (_name, options, chosen) => {
    const { result } = render(actionsOf(), viewOf(options))
    act(() => result.current.toggleSelectMode())
    act(() => result.current.selectAll(chosen))

    expect(result.current.bar).toBeUndefined()
  })

  it('counts them once chosen, says they can be edited only, and lets go with one press', () => {
    const { result } = render(actionsOf())
    enter(result)

    act(() => result.current.selectMatching!())

    expect(result.current.selectedCount).toBe(342)
    expect(result.current.selected.size).toBe(3)
    expect(result.current.describable).toBe(false)
    expect(result.current.bar).toEqual({ allLabel: 'Deselect all', matching: false, note: 'edit only', deleteBlocked: true })
  })

  it('keeps the count it was shown while the list reads again, because the server checks that count', async () => {
    const actions = actionsOf()
    const { result, rerender } = render(actions)
    enter(result)
    act(() => result.current.selectMatching!())

    rerender({ view: viewOf({ matching: { ...target, expectedCount: 340, expectedRevision: 'r10' } }) })
    await act(() => result.current.confirmBulkEdit({ categoryId: 7 }))

    expect(actions.updateMatching).toHaveBeenCalledWith(target, { categoryId: 7 }, [])
  })

  it('ends when the filter changes, back to the rows the list holds', () => {
    const { result, rerender } = render(actionsOf())
    enter(result)
    act(() => result.current.selectMatching!())

    rerender({ view: viewOf({ matching: null, filter: { categoryId: 5 } }) })

    expect(result.current.selectedCount).toBe(3)
    expect(result.current.bar).toBeUndefined()
  })

  it.each([
    ['unticking a row', (r: Rendered) => r.current.toggleSelected(1)],
    ['clearing', (r: Rendered) => r.current.deselectAll()],
    ['choosing the rows on screen', (r: Rendered) => r.current.selectAll(LOADED)],
    ['picking a day', (r: Rendered) => r.current.toggleDate([1])],
    ['choosing one row', (r: Rendered) => r.current.enterAndSelect(1)],
  ])('ends on %s, because no filter names the rows that are left', (_name, act1) => {
    const { result } = render(actionsOf())
    enter(result)
    act(() => result.current.selectMatching!())

    act(() => act1(result))

    expect(result.current.selectedCount).toBe(result.current.selected.size)
  })

  it('is not there when select mode is entered again', () => {
    const { result } = render(actionsOf())
    enter(result)
    act(() => result.current.selectMatching!())
    act(() => result.current.toggleSelectMode())

    act(() => result.current.toggleSelectMode())

    expect(result.current.selectedCount).toBe(0)
  })

  it('cannot be deleted, because a delete names its rows', () => {
    const { result } = render(actionsOf())
    enter(result)
    act(() => result.current.selectMatching!())

    act(() => result.current.requestBatchDelete())

    expect(result.current.pendingBatchDelete).toBe(false)
  })

  it('does not count the rows a filter hid, which are not part of an edit on every matching row', () => {
    const { result } = render(actionsOf())
    enter(result)
    act(() => result.current.selectAll([1, 2, 3, 98, 99]))
    expect(result.current.hiddenCount).toBe(2)

    act(() => result.current.selectMatching!())

    expect(result.current.hiddenCount).toBe(0)
  })
})

describe('editing what the selection names', () => {
  it('goes through the filter with the count and revision the user was shown, and says how many it changed', async () => {
    const actions = actionsOf()
    const { result, showToast } = render(actions)
    enter(result)
    act(() => result.current.selectMatching!())

    await act(() => result.current.confirmBulkEdit({ categoryId: 7 }, [5]))

    expect(actions.updateMatching).toHaveBeenCalledWith(target, { categoryId: 7 }, [5])
    expect(actions.updateTransactions).not.toHaveBeenCalled()
    expect(actions.addLabels).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith('Updated 342 transactions', 'success')
    expect(result.current.selectMode).toBe(false)
  })

  it('goes through the filter for rows chosen one by one when they are exactly the rows it matches', async () => {
    const actions = actionsOf()
    const { result, showToast } = render(actions, viewOf({ matching: { ...target, expectedCount: 3 }, partial: false }))
    enter(result)

    await act(() => result.current.confirmBulkEdit({ categoryId: 7 }, [5]))

    expect(actions.updateMatching).toHaveBeenCalledWith({ ...target, expectedCount: 3 }, { categoryId: 7 }, [5])
    expect(actions.updateTransactions).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith('Updated 3 transactions', 'success')
  })

  it('goes by id, and adds the labels through the bulk route, for rows that are only some of those it matches', async () => {
    const actions = actionsOf()
    const { result } = render(actions)
    act(() => result.current.toggleSelectMode())
    act(() => result.current.selectAll([1, 2]))

    await act(() => result.current.confirmBulkEdit({ categoryId: 7 }, [5]))

    expect(actions.updateTransactions).toHaveBeenCalledWith([1, 2], { categoryId: 7 })
    expect(actions.addLabels).toHaveBeenCalledWith([1, 2], [5])
    expect(actions.updateMatching).not.toHaveBeenCalled()
    expect(actions.setTransactionLabels).not.toHaveBeenCalled()
  })

  it('adds labels alone through the filter too', async () => {
    const actions = actionsOf()
    const { result } = render(actions)
    enter(result)
    act(() => result.current.selectMatching!())

    await act(() => result.current.confirmBulkEdit({}, [5]))

    expect(actions.updateMatching).toHaveBeenCalledWith(target, {}, [5])
  })

  it('lets go of the choice and closes the sheet when the server refuses, because the count it was shown cannot be trusted', async () => {
    const refused = new Error('The ledger changed since you looked at these transactions. Nothing was changed; look again and retry')
    const actions = actionsOf({ updateMatching: vi.fn().mockRejectedValue(refused) })
    const { result, showToast } = render(actions)
    enter(result)
    act(() => result.current.selectMatching!())
    act(() => result.current.requestBulkEdit())

    await act(() => result.current.confirmBulkEdit({ categoryId: 7 }))

    expect(showToast).toHaveBeenCalledWith(refused.message, 'error')
    expect(result.current.selectedCount).toBe(3)
    expect(result.current.pendingBulkEdit).toBe(false)
    expect(result.current.selectMode).toBe(true)
  })

  it('keeps the sheet open when an edit by id fails, as it always did', async () => {
    const actions = actionsOf({ updateTransactions: vi.fn().mockRejectedValue(new Error('offline')) })
    const { result } = render(actions)
    act(() => result.current.toggleSelectMode())
    act(() => result.current.selectAll([1, 2]))
    act(() => result.current.requestBulkEdit())

    await act(() => result.current.confirmBulkEdit({ categoryId: 7 }))

    expect(result.current.pendingBulkEdit).toBe(true)
  })
})
