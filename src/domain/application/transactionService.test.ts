import { describe, expect, it } from 'vitest'
import {
  bulkCreateTransactions,
  bulkDeleteTransactions,
  validateBulkTransactions,
  validateNewTransaction,
} from './transactionService'
import { inMemoryExpenseRepository } from '../../testing/inMemoryExpenseRepository'

const validTxn = {
  date: '2026-01-01',
  budgetMonth: '2026-01',
  description: 'Test',
  accountId: 1,
  categoryId: 2,
  type: 'expense' as const,
  amountCents: -1000,
  cancelled: false,
}

describe('transactionService validation', () => {
  it('requires core fields on a single transaction', () => {
    expect(() => validateNewTransaction({ ...validTxn, date: '' })).toThrow(
      'date, budgetMonth, accountId and categoryId are required',
    )
  })

  it('validates bulk payloads with the same rules', () => {
    expect(validateBulkTransactions([validTxn])).toHaveLength(1)
    expect(() => validateBulkTransactions('nope')).toThrow('transactions array is required')
    expect(() => validateBulkTransactions([{ ...validTxn, amountCents: NaN }])).toThrow(
      'amountCents must be a number',
    )
  })

  it('bulk create and delete delegate to the repository', async () => {
    const repo = inMemoryExpenseRepository(
      {
        accounts: [{ id: 1, name: 'Cash', kind: 'debit', settlement: 'immediate', active: true }],
        categories: [
          { id: 2, name: 'Food', monthlyBudgetCents: 0, sortOrder: 0, active: true },
        ],
      },
      'owner@example.com',
    )
    const created = await bulkCreateTransactions(repo, 'owner@example.com', [validTxn])
    expect(created.created).toBe(1)
    const id = created.transactions[0]?.id
    expect(id).toBeDefined()
    const deleted = await bulkDeleteTransactions(repo, 'owner@example.com', [id])
    expect(deleted).toEqual({ deleted: 1, requested: 1 })
  })
})
