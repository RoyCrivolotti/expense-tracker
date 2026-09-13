import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset, Transaction } from '../types'
import type { ExpenseDataSource, NewTransaction } from '../data/dataSource'
import { defaultExpenseSettings } from '../engine'
import { useExpenseActions } from './useExpenseActions'

const baseDataset: ExpenseDataset = {
  flags: [],
  attachments: [],
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
  goalScenarios: [],
  installmentPlans: [],
  wealthAccounts: [],
  wealthCheckins: [],
  settings: defaultExpenseSettings(),
}

const newTxn = {
  date: '2026-01-15',
  budgetMonth: '2026-01',
  description: 'Coffee',
  accountId: 2,
  categoryId: 1,
  type: 'expense',
  amountCents: 350,
  cancelled: false,
} satisfies NewTransaction

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

  it('updateTransactions calls source and applyPatch', async () => {
    const updatedTxn: Transaction = { ...savedTxn, categoryId: 9 }
    const updateTransactions = vi.fn().mockResolvedValue({ updated: 1, transactions: [updatedTxn] })
    const source: ExpenseDataSource = {
      canWrite: true,
      load: vi.fn(),
      updateTransactions,
    }
    let dataset = { ...baseDataset, transactions: [savedTxn] }
    const applyPatch = vi.fn((patch: (d: ExpenseDataset) => ExpenseDataset) => {
      dataset = patch(dataset)
    })
    const { result } = renderHook(() =>
      useExpenseActions(source, applyPatch, vi.fn()),
    )
    await act(async () => {
      await result.current!.updateTransactions([42], { categoryId: 9 })
    })
    expect(updateTransactions).toHaveBeenCalledWith([42], { categoryId: 9 })
    expect(applyPatch).toHaveBeenCalled()
    expect(dataset.transactions[0]?.categoryId).toBe(9)
  })
})

describe('useExpenseActions — flags', () => {
  const flag = { id: 7, name: 'Work travel', color: '#6366f1', reimbursable: true, sortOrder: 0, active: true }

  function harness(source: Partial<ExpenseDataSource>) {
    let dataset = baseDataset
    const applyPatch = vi.fn((patch: (d: ExpenseDataset) => ExpenseDataset) => {
      dataset = patch(dataset)
    })
    const { result } = renderHook(() =>
      useExpenseActions({ canWrite: true, load: vi.fn(), ...source }, applyPatch, vi.fn()),
    )
    return { actions: result.current!, applyPatch, read: () => dataset }
  }

  it('createFlag returns the saved flag and puts it in the dataset', async () => {
    const createFlag = vi.fn().mockResolvedValue(flag)
    const { actions, read } = harness({ createFlag })

    let created
    await act(async () => {
      created = await actions.createFlag({
        name: 'Work travel',
        color: '#6366f1',
        reimbursable: true,
        sortOrder: 0,
        active: true,
      })
    })

    expect(createFlag).toHaveBeenCalled()
    expect(created).toEqual(flag)
    expect(read().flags).toEqual([flag])
  })

  it('updateFlag replaces the flag in the dataset', async () => {
    const renamed = { ...flag, name: 'Client travel' }
    const { actions, read } = harness({
      createFlag: vi.fn().mockResolvedValue(flag),
      updateFlag: vi.fn().mockResolvedValue(renamed),
    })

    await act(async () => {
      await actions.createFlag({ name: 'Work travel', color: '#6366f1', reimbursable: true, sortOrder: 0, active: true })
      await actions.updateFlag(flag.id, { name: 'Client travel' })
    })

    expect(read().flags).toEqual([renamed])
  })

  it('deleteFlag drops the flag and reports how many rows were unflagged', async () => {
    const { actions, read } = harness({
      createFlag: vi.fn().mockResolvedValue(flag),
      deleteFlag: vi.fn().mockResolvedValue({ unflagged: 3 }),
    })

    let result
    await act(async () => {
      await actions.createFlag({ name: 'Work travel', color: '#6366f1', reimbursable: true, sortOrder: 0, active: true })
      result = await actions.deleteFlag(flag.id)
    })

    expect(result).toEqual({ unflagged: 3 })
    expect(read().flags).toEqual([])
  })

})

describe('useExpenseActions — attachments', () => {
  const attachment = {
    id: 5,
    transactionId: 42,
    contentType: 'image/jpeg',
    byteSize: 1_000,
    createdAt: '2026-05-01T00:00:00Z',
    hasThumb: true,
  }

  function harness(source: Partial<ExpenseDataSource>) {
    let dataset = baseDataset
    const applyPatch = vi.fn((patch: (d: ExpenseDataset) => ExpenseDataset) => {
      dataset = patch(dataset)
    })
    const { result } = renderHook(() =>
      useExpenseActions({ canWrite: true, load: vi.fn(), ...source }, applyPatch, vi.fn()),
    )
    return { actions: result.current!, read: () => dataset }
  }

  it('puts an uploaded receipt into the dataset', async () => {
    const uploadAttachment = vi.fn().mockResolvedValue(attachment)
    const { actions, read } = harness({ uploadAttachment })

    await act(async () => {
      await actions.uploadAttachment(42, new File([], 'a.jpg'))
    })

    expect(uploadAttachment).toHaveBeenCalledWith(42, expect.any(File))
    expect(read().attachments).toEqual([attachment])
  })

  it('removes a deleted receipt from the dataset', async () => {
    const { actions, read } = harness({
      uploadAttachment: vi.fn().mockResolvedValue(attachment),
      deleteAttachment: vi.fn().mockResolvedValue(undefined),
    })

    await act(async () => {
      await actions.uploadAttachment(42, new File([], 'a.jpg'))
      await actions.deleteAttachment(5)
    })

    expect(read().attachments).toEqual([])
  })
})
