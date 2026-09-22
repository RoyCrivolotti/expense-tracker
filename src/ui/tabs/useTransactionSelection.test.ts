import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { batchDeleteMessage, bulkOutcomeCopy, useTransactionSelection } from './useTransactionSelection'
import type { ExpenseActions } from '../actions'
import { ToastContext } from '../hooks/useToast'

function mockActions(overrides: Partial<ExpenseActions> = {}): ExpenseActions {
  return {
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    deleteTransactions: vi.fn((ids: number[]) => Promise.resolve(ids.length)),
    updateTransactions: vi.fn((ids: number[]) => Promise.resolve(ids.length)),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    setStatementPaid: vi.fn(),
    setCashActual: vi.fn(),
    bulkCreateTransactions: vi.fn(),
    createInstallmentPlan: vi.fn(),
    updateInstallmentPlan: vi.fn(),
    deleteInstallmentPlan: vi.fn(),
    updateSettings: vi.fn(),
    ...overrides,
  } as unknown as ExpenseActions
}

describe('batchDeleteMessage', () => {
  it('uses singular copy for one row', () => {
    expect(batchDeleteMessage(1)).toBe('1 transaction will be removed permanently.')
  })

  it('uses plural copy for multiple rows', () => {
    expect(batchDeleteMessage(3)).toBe('3 transactions will be removed permanently.')
  })

  it('says which chosen rows the delete leaves alone', () => {
    // Someone who chose eleven rows and confirms "10 will be removed" should not have
    // to work out for themselves that the eleventh is safe.
    expect(batchDeleteMessage(10, 1)).toBe(
      "10 transactions will be removed permanently. 1 more you selected isn't shown and won't be deleted.",
    )
    expect(batchDeleteMessage(2, 3)).toContain("3 more you selected aren't shown and won't be deleted.")
  })
})

/** Renders the hook inside a ToastContext so the toast message can be asserted. */
function renderWithToast(actions: ExpenseActions) {
  const showToast = vi.fn()
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(ToastContext.Provider, { value: { showToast } }, children)
  const { result } = renderHook(() => useTransactionSelection(actions), { wrapper })
  return { result, showToast }
}

describe('useTransactionSelection — toasts report the server count', () => {
  it('names both numbers when a selected row was already gone', async () => {
    const actions = mockActions({ deleteTransactions: vi.fn().mockResolvedValue(2) })
    const { result, showToast } = renderWithToast(actions)
    act(() => result.current.selectAll([1, 2, 3]))
    act(() => result.current.requestBatchDelete())
    await act(async () => {
      await result.current.confirmBatchDelete()
    })
    expect(showToast).toHaveBeenCalledWith('Deleted 2 of 3 transactions', 'success')
  })

  it('reports the plain count when the server touched everything', async () => {
    const actions = mockActions({ updateTransactions: vi.fn().mockResolvedValue(2) })
    const { result, showToast } = renderWithToast(actions)
    act(() => result.current.selectAll([1, 2]))
    await act(async () => {
      await result.current.confirmBulkEdit({ categoryId: 1 })
    })
    expect(showToast).toHaveBeenCalledWith('Updated 2 transactions', 'success')
  })
})

describe('bulkOutcomeCopy', () => {
  it('reports the plain count when everything requested was touched', () => {
    expect(bulkOutcomeCopy('Deleted', 3, 3)).toBe('Deleted 3 transactions')
    expect(bulkOutcomeCopy('Updated', 1, 1)).toBe('Updated 1 transaction')
  })

  it('names both numbers when the server touched fewer than requested', () => {
    expect(bulkOutcomeCopy('Deleted', 2, 3)).toBe('Deleted 2 of 3 transactions')
    expect(bulkOutcomeCopy('Updated', 0, 2)).toBe('Updated 0 of 2 transactions')
  })
})

describe('useTransactionSelection — bulk edit', () => {
  it('requestBulkEdit sets pendingBulkEdit when items are selected', () => {
    const { result } = renderHook(() => useTransactionSelection(mockActions()))
    act(() => result.current.toggleSelectMode())
    act(() => result.current.toggleSelected(1))
    act(() => result.current.requestBulkEdit())
    expect(result.current.pendingBulkEdit).toBe(true)
  })

  it('requestBulkEdit does nothing when no items are selected', () => {
    const { result } = renderHook(() => useTransactionSelection(mockActions()))
    act(() => result.current.toggleSelectMode())
    act(() => result.current.requestBulkEdit())
    expect(result.current.pendingBulkEdit).toBe(false)
  })

  it('cancelBulkEdit clears pendingBulkEdit', () => {
    const { result } = renderHook(() => useTransactionSelection(mockActions()))
    act(() => result.current.toggleSelectMode())
    act(() => result.current.toggleSelected(1))
    act(() => result.current.requestBulkEdit())
    act(() => result.current.cancelBulkEdit())
    expect(result.current.pendingBulkEdit).toBe(false)
  })

  it('confirmBulkEdit calls updateTransactions and exits select mode on success', async () => {
    const updateTransactions = vi.fn((ids: number[]) => Promise.resolve(ids.length))
    const actions = mockActions({ updateTransactions })
    const { result } = renderHook(() => useTransactionSelection(actions))
    act(() => result.current.toggleSelectMode())
    act(() => result.current.toggleSelected(5))
    act(() => result.current.toggleSelected(6))
    await act(async () => {
      await result.current.confirmBulkEdit({ categoryId: 1 })
    })
    expect(updateTransactions).toHaveBeenCalledWith([5, 6], { categoryId: 1 })
    expect(result.current.selectMode).toBe(false)
    expect(result.current.pendingBulkEdit).toBe(false)
  })

  it('confirmBulkEdit shows error and keeps selection on failure', async () => {
    const updateTransactions = vi.fn().mockRejectedValue(new Error('Network error'))
    const actions = mockActions({ updateTransactions })
    const { result } = renderHook(() => useTransactionSelection(actions))
    act(() => result.current.toggleSelectMode())
    act(() => result.current.toggleSelected(5))
    await act(async () => {
      await result.current.confirmBulkEdit({ categoryId: 1 })
    })
    expect(result.current.selectMode).toBe(true)
    expect(result.current.selected.has(5)).toBe(true)
  })

  it('exitSelect clears pendingBulkEdit along with other state', () => {
    const { result } = renderHook(() => useTransactionSelection(mockActions()))
    act(() => result.current.toggleSelectMode())
    act(() => result.current.toggleSelected(1))
    act(() => result.current.requestBulkEdit())
    act(() => result.current.toggleSelectMode())
    expect(result.current.pendingBulkEdit).toBe(false)
    expect(result.current.selectMode).toBe(false)
  })
})

describe('useTransactionSelection — selectAll / deselectAll', () => {
  it('selectAll adds every given id to the selection', () => {
    const { result } = renderHook(() => useTransactionSelection(mockActions()))
    act(() => result.current.toggleSelectMode())
    act(() => result.current.toggleSelected(1))
    act(() => result.current.selectAll([1, 2, 3, 4]))
    expect(result.current.selected).toEqual(new Set([1, 2, 3, 4]))
  })

  it('deselectAll clears selection without leaving select mode', () => {
    const { result } = renderHook(() => useTransactionSelection(mockActions()))
    act(() => result.current.toggleSelectMode())
    act(() => result.current.selectAll([1, 2, 3]))
    act(() => result.current.deselectAll())
    expect(result.current.selected.size).toBe(0)
    expect(result.current.selectMode).toBe(true)
  })
})

describe('useTransactionSelection — enterAndSelect', () => {
  it('enters select mode and selects the given id', () => {
    const { result } = renderHook(() => useTransactionSelection(mockActions()))
    expect(result.current.selectMode).toBe(false)
    act(() => result.current.enterAndSelect(42))
    expect(result.current.selectMode).toBe(true)
    expect(result.current.selected).toEqual(new Set([42]))
  })

  it('replaces any prior selection when called again', () => {
    const { result } = renderHook(() => useTransactionSelection(mockActions()))
    act(() => result.current.toggleSelectMode())
    act(() => result.current.toggleSelected(1))
    act(() => result.current.toggleSelected(2))
    act(() => result.current.enterAndSelect(99))
    expect(result.current.selected).toEqual(new Set([99]))
  })
})

describe('useTransactionSelection — Escape key', () => {
  it('exits select mode when Escape is pressed', () => {
    const { result } = renderHook(() => useTransactionSelection(mockActions()))
    act(() => result.current.toggleSelectMode())
    expect(result.current.selectMode).toBe(true)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(result.current.selectMode).toBe(false)
  })

  /** A dialog in the page that closes itself on Escape, as every dialog here does. */
  function mountDialog({ hidden = false, inert = false } = {}) {
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.hidden = hidden
    if (inert) dialog.setAttribute('inert', '')
    document.body.append(dialog)
    // In a browser React removes a closed dialog between listeners, before the key has
    // bubbled up to the window, so this one goes at the document. One that is inert is on its
    // way out and answers nothing, so it stays.
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !hidden && !inert) dialog.remove()
    }
    document.addEventListener('keydown', close)
    return {
      pressEscape: () =>
        dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
      unmount: () => {
        document.removeEventListener('keydown', close)
        dialog.remove()
      },
    }
  }

  it('leaves Escape to a dialog, even one gone before the key reaches the window', () => {
    const { result } = renderHook(() => useTransactionSelection(mockActions()))
    act(() => result.current.toggleSelectMode())
    act(() => result.current.toggleSelected(1))
    const dialog = mountDialog()
    try {
      act(() => {
        dialog.pressEscape()
      })
    } finally {
      dialog.unmount()
    }
    expect(result.current.selectMode).toBe(true)
    expect([...result.current.selected]).toEqual([1])
  })

  it('still exits when the only dialog in the page is hidden', () => {
    const { result } = renderHook(() => useTransactionSelection(mockActions()))
    act(() => result.current.toggleSelectMode())
    const dialog = mountDialog({ hidden: true })
    try {
      act(() => {
        dialog.pressEscape()
      })
    } finally {
      dialog.unmount()
    }
    expect(result.current.selectMode).toBe(false)
  })

  it('still exits when the only dialog in the page is on its way out', () => {
    const { result } = renderHook(() => useTransactionSelection(mockActions()))
    act(() => result.current.toggleSelectMode())
    const dialog = mountDialog({ inert: true })
    try {
      act(() => {
        dialog.pressEscape()
      })
    } finally {
      dialog.unmount()
    }
    expect(result.current.selectMode).toBe(false)
  })

  it('ignores other keys', () => {
    const { result } = renderHook(() => useTransactionSelection(mockActions()))
    act(() => result.current.toggleSelectMode())
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    })
    expect(result.current.selectMode).toBe(true)
  })
})

describe('useTransactionSelection — while a bulk action runs', () => {
  it('stays in select mode until the action settles, whatever is pressed', async () => {
    // The request can't be called back, so letting the user leave would only pretend it was.
    let settle: (deleted: number) => void = () => {}
    const actions = mockActions({
      deleteTransactions: vi.fn(
        () =>
          new Promise<number>((resolve) => {
            settle = resolve
          }),
      ),
    })
    const { result } = renderHook(() => useTransactionSelection(actions))
    act(() => result.current.toggleSelectMode())
    act(() => result.current.toggleSelected(1))
    act(() => result.current.requestBatchDelete())
    let request: Promise<void> = Promise.resolve()
    act(() => {
      request = result.current.confirmBatchDelete()
    })
    expect(result.current.busy).toBe(true)

    act(() => result.current.toggleSelectMode())
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(result.current.selectMode).toBe(true)
    expect([...result.current.selected]).toEqual([1])

    await act(async () => {
      settle(1)
      await request
    })
    expect(result.current.selectMode).toBe(false)
  })
})

describe('useTransactionSelection — rows a filter hides', () => {
  /** Render with a visible list the test can change, as a filter would. */
  function renderWith(visible: number[], existing = [1, 2, 3, 4, 5], actions = mockActions()) {
    return renderHook(
      ({ v, e }: { v: number[]; e: number[] }) => useTransactionSelection(actions, v, e),
      { initialProps: { v: visible, e: existing } },
    )
  }

  it('counts only the chosen rows that are on screen', () => {
    const { result, rerender } = renderWith([1, 2, 3, 4, 5])
    act(() => result.current.selectAll([1, 2, 3, 4, 5]))

    rerender({ v: [2, 4], e: [1, 2, 3, 4, 5] })

    expect([...result.current.selected]).toEqual([2, 4])
    expect(result.current.hiddenCount).toBe(3)
  })

  it('gives the hidden rows back when the filter widens', () => {
    // The bug: narrowing dropped them for good, so widening again showed fewer
    // selected than the user had chosen, with only the count to hint at it.
    const { result, rerender } = renderWith([1, 2, 3, 4, 5])
    act(() => result.current.selectAll([1, 2, 3, 4, 5]))

    rerender({ v: [2, 4], e: [1, 2, 3, 4, 5] })
    rerender({ v: [1, 2, 3, 4, 5], e: [1, 2, 3, 4, 5] })

    expect(result.current.selected).toEqual(new Set([1, 2, 3, 4, 5]))
    expect(result.current.hiddenCount).toBe(0)
  })

  it('a bulk delete after a filter change only reaches still-visible rows', async () => {
    // The guarantee #110 added, which keeping hidden rows must not weaken.
    const deleteTransactions = vi.fn((ids: number[]) => Promise.resolve(ids.length))
    const { result, rerender } = renderWith([1, 2, 3, 4, 5], undefined, mockActions({ deleteTransactions }))
    act(() => result.current.selectAll([1, 2, 3, 4, 5]))

    rerender({ v: [2, 4], e: [1, 2, 3, 4, 5] })
    act(() => result.current.requestBatchDelete())
    await act(async () => {
      await result.current.confirmBatchDelete()
    })

    expect(deleteTransactions).toHaveBeenCalledWith([2, 4])
  })

  it('a bulk edit after a filter change only reaches still-visible rows', async () => {
    const updateTransactions = vi.fn((ids: number[]) => Promise.resolve(ids.length))
    const { result, rerender } = renderWith([1, 2, 3], [1, 2, 3], mockActions({ updateTransactions }))
    act(() => result.current.selectAll([1, 2, 3]))

    rerender({ v: [3], e: [1, 2, 3] })
    await act(async () => {
      await result.current.confirmBulkEdit({ categoryId: 9 })
    })

    expect(updateTransactions).toHaveBeenCalledWith([3], { categoryId: 9 })
  })

  it('offers nothing to act on when every chosen row is hidden', () => {
    const { result, rerender } = renderWith([1, 2, 3])
    act(() => result.current.selectAll([1, 2]))

    rerender({ v: [3], e: [1, 2, 3] })
    act(() => result.current.requestBatchDelete())

    expect(result.current.selected.size).toBe(0)
    expect(result.current.hiddenCount).toBe(2)
    expect(result.current.pendingBatchDelete).toBe(false)
  })

  it('lets go of a row deleted elsewhere, which no filter will bring back', () => {
    const { result, rerender } = renderWith([1, 2, 3], [1, 2, 3])
    act(() => result.current.selectAll([1, 2, 3]))

    rerender({ v: [1, 3], e: [1, 3] })

    expect(result.current.selected).toEqual(new Set([1, 3]))
    expect(result.current.hiddenCount).toBe(0)
  })

  it('select all adds the rows on screen and keeps the hidden choices', () => {
    const { result, rerender } = renderWith([1, 2, 3, 4, 5])
    act(() => result.current.selectAll([1, 2]))

    rerender({ v: [3, 4], e: [1, 2, 3, 4, 5] })
    act(() => result.current.selectAll([3, 4]))
    rerender({ v: [1, 2, 3, 4, 5], e: [1, 2, 3, 4, 5] })

    expect(result.current.selected).toEqual(new Set([1, 2, 3, 4]))
  })

  it('deselect all clears the hidden choices too', () => {
    const { result, rerender } = renderWith([1, 2, 3])
    act(() => result.current.selectAll([1, 2, 3]))

    rerender({ v: [1], e: [1, 2, 3] })
    act(() => result.current.deselectAll())
    rerender({ v: [1, 2, 3], e: [1, 2, 3] })

    expect(result.current.selected.size).toBe(0)
  })

  it('ticks a whole day, then unticks it, keeping rows chosen elsewhere', () => {
    const { result } = renderWith([1, 2, 3, 4])
    act(() => result.current.toggleSelected(4))

    act(() => result.current.toggleDate([1, 2]))
    expect(result.current.selected).toEqual(new Set([1, 2, 4]))

    act(() => result.current.toggleDate([1, 2]))
    expect(result.current.selected).toEqual(new Set([4]))
  })

  it('keeps the same Set when nothing is hidden, so a re-render is not a change', () => {
    const { result, rerender } = renderWith([1, 2, 3])
    act(() => result.current.selectAll([1, 2]))
    const before = result.current.selected

    rerender({ v: [1, 2, 3], e: [1, 2, 3] })

    expect(result.current.selected).toBe(before)
  })
})
