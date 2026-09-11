import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { batchDeleteMessage, useTransactionSelection } from './useTransactionSelection'
import type { ExpenseActions } from '../actions'

function mockActions(overrides: Partial<ExpenseActions> = {}): ExpenseActions {
  return {
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    deleteTransactions: vi.fn().mockResolvedValue(undefined),
    updateTransactions: vi.fn().mockResolvedValue(undefined),
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
    const updateTransactions = vi.fn().mockResolvedValue(undefined)
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
