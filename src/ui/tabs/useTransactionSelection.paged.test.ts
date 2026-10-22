import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseActions } from '../actions'
import { ToastContext } from '../hooks/useToast'
import { useTransactionSelection } from './useTransactionSelection'

const LOADED = [1, 2, 3]

function actionsOf(): ExpenseActions {
  return {
    updateTransactions: vi.fn((ids: number[]) => Promise.resolve(ids.length)),
    addLabels: vi.fn((ids: number[]) => Promise.resolve(ids.length)),
    setTransactionLabels: vi.fn().mockResolvedValue(undefined),
  } as unknown as ExpenseActions
}

function render(actions: ExpenseActions, existingIds: number[] | undefined, labelsByBulkRoute = false) {
  const showToast = vi.fn()
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(ToastContext.Provider, { value: { showToast } }, children)
  return renderHook(() => useTransactionSelection(actions, LOADED, existingIds, undefined, [], labelsByBulkRoute), { wrapper })
}

describe('a selection over a list that does not hold every row', () => {
  it('counts a chosen row the list does not show as hidden, because it may be one nobody has read', () => {
    const { result } = render(actionsOf(), undefined)
    act(() => result.current.selectAll([1, 2, 99]))

    expect(result.current.selected.size).toBe(2)
    expect(result.current.hiddenCount).toBe(1)
  })

  it('lets go of a chosen row that is gone only when the list holds every row and says so', () => {
    const { result } = render(actionsOf(), [1, 2, 3])
    act(() => result.current.selectAll([1, 2, 99]))

    expect(result.current.hiddenCount).toBe(0)
  })
})

describe('labels added to the rows chosen on a list read in pages', () => {
  it('go through the bulk route and keep the labels the rows have, which are not all held here', async () => {
    const actions = actionsOf()
    const { result } = render(actions, undefined, true)
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
