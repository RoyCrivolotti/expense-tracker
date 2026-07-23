import { describe, expect, it } from 'vitest'
import {
  bulkCreateTransactions,
  bulkDeleteTransactions,
  patchTransaction,
  validateBulkTransactions,
  validateNewTransaction,
} from './transactionService'
import { inMemoryExpenseRepository } from '../../testing/inMemoryExpenseRepository'
import type { ExpenseRepositorySeed } from '../../testing/inMemoryExpenseRepository'

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

const OWNER = 'owner@example.com'

function planRepo() {
  const seed: ExpenseRepositorySeed = {
    accounts: [{ id: 1, name: 'Cash', kind: 'debit', settlement: 'immediate', active: true }],
    categories: [{ id: 2, name: 'Food', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
    installmentPlans: [
      {
        id: 7,
        description: 'iPhone',
        totalCount: 24,
        amountCents: 5783,
        accountId: 1,
        categoryId: 2,
        type: 'expense',
        anchorBudgetMonth: '2026-01',
        startInstallmentIndex: 1,
        active: true,
      },
    ],
  }
  return inMemoryExpenseRepository(seed, OWNER)
}

async function seedTxn(repo: ReturnType<typeof planRepo>, budgetMonth: string) {
  return repo.insertTransaction(OWNER, {
    date: `${budgetMonth}-05`,
    budgetMonth,
    description: 'iPhone',
    accountId: 1,
    categoryId: 2,
    type: 'expense',
    amountCents: 5783,
    cancelled: false,
  })
}

describe('transactionService plan linking on update', () => {
  it('links an existing transaction, assigning the start index', async () => {
    const repo = planRepo()
    const txn = await seedTxn(repo, '2026-01')
    const linked = await patchTransaction(repo, OWNER, txn.id, { planId: 7 })
    expect(linked.planId).toBe(7)
    expect(linked.installmentIndex).toBe(1)
  })

  it('auto-assigns the next index for subsequent links', async () => {
    const repo = planRepo()
    const first = await seedTxn(repo, '2026-01')
    const second = await seedTxn(repo, '2026-02')
    await patchTransaction(repo, OWNER, first.id, { planId: 7 })
    const linked = await patchTransaction(repo, OWNER, second.id, { planId: 7 })
    expect(linked.installmentIndex).toBe(2)
  })

  it('rejects linking to an index already recorded', async () => {
    const repo = planRepo()
    const first = await seedTxn(repo, '2026-01')
    const second = await seedTxn(repo, '2026-02')
    await patchTransaction(repo, OWNER, first.id, { planId: 7, installmentIndex: 3 })
    await expect(
      patchTransaction(repo, OWNER, second.id, { planId: 7, installmentIndex: 3 }),
    ).rejects.toThrow('Installment already recorded')
  })

  it('allows re-saving a linked row at its own index (self excluded)', async () => {
    const repo = planRepo()
    const txn = await seedTxn(repo, '2026-01')
    await patchTransaction(repo, OWNER, txn.id, { planId: 7, installmentIndex: 5 })
    const resaved = await patchTransaction(repo, OWNER, txn.id, {
      planId: 7,
      installmentIndex: 5,
      description: 'iPhone (edited)',
    })
    expect(resaved.installmentIndex).toBe(5)
    expect(resaved.description).toBe('iPhone (edited)')
  })

  it('unlinks a transaction when planId is null', async () => {
    const repo = planRepo()
    const txn = await seedTxn(repo, '2026-01')
    await patchTransaction(repo, OWNER, txn.id, { planId: 7 })
    const unlinked = await patchTransaction(repo, OWNER, txn.id, { planId: null })
    expect(unlinked.planId).toBeUndefined()
    expect(unlinked.installmentIndex).toBeUndefined()
  })
})
