import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset, Transaction } from '../types'
import type { ExpenseDataSource, NewTransaction } from '../data/dataSource'
import { useExpenseActions } from './useExpenseActions'

const baseDataset: ExpenseDataset = {
  categories: [{ id: 1, name: 'Food', monthlyBudgetCents: 10000, sortOrder: 1, active: true }],
  accounts: [{ id: 2, name: 'Debit', kind: 'debit', settlement: 'immediate', active: true }],
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
  settings: {
    openingCashCents: 0,
    openingInvestmentCents: 0,
    liquidNetWorthCents: 0,
    defaultAccountId: null,
  },
}

const newTxn: NewTransaction = {
  date: '2026-01-15',
  budgetMonth: '2026-01',
  description: 'Coffee',
  accountId: 2,
  categoryId: 1,
  type: 'expense',
  amountCents: 350,
  cancelled: false,
}

const savedTxn: Transaction = { ...newTxn, id: 42, status: 'posted' }

describe('useExpenseActions', () => {
  it('returns undefined for read-only sources', () => {
    const source: ExpenseDataSource = { canWrite: false, load: vi.fn() }
    const { result } = renderHook(() =>
      useExpenseActions(source, vi.fn(), vi.fn()),
    )
    expect(result.current).toBeUndefined()
  })

  it('createTransaction calls source and applyPatch', async () => {
    const createTransaction = vi.fn().mockResolvedValue(savedTxn)
    const source: ExpenseDataSource = {
      canWrite: true,
      load: vi.fn(),
      createTransaction,
    }
    let dataset = baseDataset
    const applyPatch = vi.fn((patch: (d: ExpenseDataset) => ExpenseDataset) => {
      dataset = patch(dataset)
    })
    const { result } = renderHook(() =>
      useExpenseActions(source, applyPatch, vi.fn()),
    )
    await act(async () => {
      await result.current!.createTransaction(newTxn)
    })
    expect(createTransaction).toHaveBeenCalledWith(newTxn)
    expect(applyPatch).toHaveBeenCalledOnce()
    expect(dataset.transactions).toHaveLength(1)
    expect(dataset.transactions[0]?.id).toBe(42)
  })
})
