import { describe, expect, it, vi } from 'vitest'
import type { NewTransaction } from '../../data/dataSource'
import type { ExpenseActions } from '../actions'
import { createTransactionWithIntent, updateTransactionWithIntent } from './transactionSaveIntent'

const input: NewTransaction = {
  date: '2026-01-15',
  budgetMonth: '2026-01',
  description: 'Iphone, Cetelam',
  accountId: 1,
  categoryId: 2,
  type: 'expense',
  amountCents: -5783,
  cancelled: false,
}

function makeActions(overrides: Partial<ExpenseActions> = {}): ExpenseActions {
  return {
    onEdit: vi.fn(),
    onAdd: vi.fn(),
    onDuplicate: vi.fn(),
    createTransaction: vi.fn().mockResolvedValue(undefined),
    createTransactions: vi.fn().mockResolvedValue(undefined),
    updateTransaction: vi.fn().mockResolvedValue(undefined),
    deleteTransaction: vi.fn().mockResolvedValue(undefined),
    deleteTransactions: vi.fn().mockResolvedValue(undefined),
    setStatementPaid: vi.fn().mockResolvedValue(undefined),
    setCashActual: vi.fn().mockResolvedValue(undefined),
    createCategory: vi.fn().mockResolvedValue(undefined),
    updateCategory: vi.fn().mockResolvedValue(undefined),
    createAccount: vi.fn().mockResolvedValue(undefined),
    updateAccount: vi.fn().mockResolvedValue(undefined),
    updateSettings: vi.fn().mockResolvedValue(undefined),
    updateGoals: vi.fn().mockResolvedValue(undefined),
    createScenario: vi.fn(),
    updateScenario: vi.fn().mockResolvedValue(undefined),
    deleteScenario: vi.fn().mockResolvedValue(undefined),
    createInstallmentPlan: vi.fn(),
    updateInstallmentPlan: vi.fn().mockResolvedValue(undefined),
    deleteInstallmentPlan: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('createTransactionWithIntent', () => {
  it('creates a plan then links the transaction to it for a new plan intent', async () => {
    const createInstallmentPlan = vi.fn().mockResolvedValue({ id: 9 })
    const createTransaction = vi.fn().mockResolvedValue(undefined)
    const actions = makeActions({ createInstallmentPlan, createTransaction })

    await createTransactionWithIntent(actions, input, {
      kind: 'new',
      totalCount: 24,
      installmentIndex: 14,
    })

    expect(createInstallmentPlan).toHaveBeenCalledTimes(1)
    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 9, installmentIndex: 14 }),
    )
  })

  it('rolls back the created plan when linking the transaction fails', async () => {
    const createInstallmentPlan = vi.fn().mockResolvedValue({ id: 9 })
    const createTransaction = vi.fn().mockRejectedValue(new Error('network down'))
    const deleteInstallmentPlan = vi.fn().mockResolvedValue(undefined)
    const actions = makeActions({ createInstallmentPlan, createTransaction, deleteInstallmentPlan })

    await expect(
      createTransactionWithIntent(actions, input, {
        kind: 'new',
        totalCount: 24,
        installmentIndex: 14,
      }),
    ).rejects.toThrow('network down')

    expect(deleteInstallmentPlan).toHaveBeenCalledWith(9)
  })

  it('does not swallow the original error if the rollback delete also fails', async () => {
    const createInstallmentPlan = vi.fn().mockResolvedValue({ id: 9 })
    const createTransaction = vi.fn().mockRejectedValue(new Error('network down'))
    const deleteInstallmentPlan = vi.fn().mockRejectedValue(new Error('delete also failed'))
    const actions = makeActions({ createInstallmentPlan, createTransaction, deleteInstallmentPlan })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      createTransactionWithIntent(actions, input, {
        kind: 'new',
        totalCount: 24,
        installmentIndex: 14,
      }),
    ).rejects.toThrow('network down')

    consoleError.mockRestore()
  })

  it('links to an existing plan without creating a new one', async () => {
    const createInstallmentPlan = vi.fn()
    const createTransaction = vi.fn().mockResolvedValue(undefined)
    const actions = makeActions({ createInstallmentPlan, createTransaction })

    await createTransactionWithIntent(actions, input, { kind: 'link', planId: 3, installmentIndex: 5 })

    expect(createInstallmentPlan).not.toHaveBeenCalled()
    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 3, installmentIndex: 5 }),
    )
  })

  it('creates a plain transaction with no intent', async () => {
    const createTransaction = vi.fn().mockResolvedValue(undefined)
    const actions = makeActions({ createTransaction })

    await createTransactionWithIntent(actions, input)

    expect(createTransaction).toHaveBeenCalledWith(input)
  })
})

describe('updateTransactionWithIntent', () => {
  it('rolls back the created plan when updating the transaction fails', async () => {
    const createInstallmentPlan = vi.fn().mockResolvedValue({ id: 11 })
    const updateTransaction = vi.fn().mockRejectedValue(new Error('conflict'))
    const deleteInstallmentPlan = vi.fn().mockResolvedValue(undefined)
    const actions = makeActions({ createInstallmentPlan, updateTransaction, deleteInstallmentPlan })

    await expect(
      updateTransactionWithIntent(actions, 42, input, {
        kind: 'new',
        totalCount: 12,
        installmentIndex: 1,
      }),
    ).rejects.toThrow('conflict')

    expect(deleteInstallmentPlan).toHaveBeenCalledWith(11)
  })

  it('unlinks a transaction from its plan', async () => {
    const updateTransaction = vi.fn().mockResolvedValue(undefined)
    const actions = makeActions({ updateTransaction })

    await updateTransactionWithIntent(actions, 42, input, { kind: 'unlink' })

    expect(updateTransaction).toHaveBeenCalledWith(42, expect.objectContaining({ planId: null }))
  })
})
