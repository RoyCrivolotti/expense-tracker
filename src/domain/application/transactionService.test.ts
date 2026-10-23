import { describe, expect, it } from 'vitest'
import {
  bulkCreateTransactions,
  bulkDeleteTransactions,
  bulkUpdateTransactions,
  MAX_BULK_CREATE,
  MAX_NOTES_LENGTH,
  patchTransaction,
  validateBulkTransactions,
  validateBulkUpdatePatch,
  validateNewTransaction,
  validateTransactionPatch,
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
  amountCents: 1000,
  cancelled: false,
}

describe('transactionService validation', () => {
  it('holds a new note to a length, and allows none', () => {
    const longest = 'n'.repeat(MAX_NOTES_LENGTH)
    expect(validateNewTransaction({ ...validTxn, notes: longest }).notes).toBe(longest)
    expect(() => validateNewTransaction({ ...validTxn, notes: `${longest}n` })).toThrow(
      `notes must be ${MAX_NOTES_LENGTH} characters or fewer`,
    )
    expect(validateNewTransaction({ ...validTxn, notes: '' }).notes).toBe('')
    expect(validateNewTransaction(validTxn).notes).toBeUndefined()
  })

  it('takes a bulk create up to a cap and refuses more before looking at a row', () => {
    const rows = (n: number) => Array.from({ length: n }, () => validTxn)
    expect(validateBulkTransactions(rows(MAX_BULK_CREATE))).toHaveLength(MAX_BULK_CREATE)
    expect(() => validateBulkTransactions(rows(MAX_BULK_CREATE + 1))).toThrow(`Too many transactions (max ${MAX_BULK_CREATE})`)
    expect(() => validateBulkTransactions([...rows(MAX_BULK_CREATE), null])).toThrow('Too many transactions')
  })

  it('names the row whose note is too long', () => {
    expect(() => validateBulkTransactions([validTxn, { ...validTxn, notes: 'n'.repeat(MAX_NOTES_LENGTH + 1) }])).toThrow(
      'Row 2: notes must be',
    )
  })

  it('requires core fields on a single transaction', () => {
    expect(() => validateNewTransaction({ ...validTxn, date: '' })).toThrow(
      'date, budgetMonth, accountId and categoryId are required',
    )
  })

  it('rejects a non-finite amountCents', () => {
    expect(() => validateNewTransaction({ ...validTxn, amountCents: NaN })).toThrow(
      'amountCents must be a whole number of cents, not zero',
    )
  })

  it('rejects a fractional amountCents, which is not a sum this ledger can hold', () => {
    expect(() => validateNewTransaction({ ...validTxn, amountCents: 12.5 })).toThrow(
      'amountCents must be a whole number of cents, not zero',
    )
  })

  it('rejects a zero amountCents, and a negative one on anything but an investment', () => {
    expect(() => validateNewTransaction({ ...validTxn, amountCents: 0 })).toThrow(
      'amountCents must be a whole number of cents, not zero',
    )
    expect(() => validateNewTransaction({ ...validTxn, type: 'expense', amountCents: -1000 })).toThrow(
      'Amounts must be positive, except a withdrawal from an investment',
    )
    // A withdrawal: money back out of the portfolio.
    expect(validateNewTransaction({ ...validTxn, type: 'investment', amountCents: -1000 }).amountCents).toBe(-1000)
  })

  it('accepts only real calendar days and months, on create as on edit', () => {
    // These fit a YYYY-MM-DD pattern and are not days; SQLite would store them and every
    // date comparison downstream (series gaps, the suggest cut-off) would read them wrong.
    for (const date of ['2025-02-30', '2024-00-15', '2024-13-01', '2024-04-31', '2026-1-01', 'yesterday']) {
      expect(() => validateNewTransaction({ ...validTxn, date }), date).toThrow('date must be YYYY-MM-DD')
      expect(() => validateTransactionPatch({ date }), date).toThrow('date must be YYYY-MM-DD')
      expect(() => validateBulkUpdatePatch({ date }), date).toThrow('date must be YYYY-MM-DD')
    }
    for (const budgetMonth of ['2026-00', '2026-13', '2026-1', '26-01', 'january']) {
      expect(() => validateNewTransaction({ ...validTxn, budgetMonth }), budgetMonth).toThrow('budgetMonth must be YYYY-MM')
      expect(() => validateTransactionPatch({ budgetMonth }), budgetMonth).toThrow('budgetMonth must be YYYY-MM')
      expect(() => validateBulkUpdatePatch({ budgetMonth }), budgetMonth).toThrow('budgetMonth must be YYYY-MM')
    }
    expect(validateNewTransaction({ ...validTxn, date: '2024-02-29', budgetMonth: '2024-12' }).date).toBe('2024-02-29')
    expect(() => validateNewTransaction({ ...validTxn, date: '2023-02-29' })).toThrow('date must be YYYY-MM-DD')
  })

  it('refuses a date or month that is not text, which used to reach SQLite as given', () => {
    expect(() => validateNewTransaction({ ...validTxn, date: 20260101 as never })).toThrow('date must be YYYY-MM-DD')
    expect(() => validateNewTransaction({ ...validTxn, budgetMonth: 202601 as never })).toThrow('budgetMonth must be YYYY-MM')
  })

  it('requires a text description on create, and lets it be blank or padded as sent', () => {
    // The stored column is NOT NULL TEXT and description_norm is computed from it with trim().
    // A number or an object reaching that line threw a 500 after the write path started
    // computing the norm; it is a 400 here.
    for (const description of [42, null, undefined, {}, ['a']]) {
      expect(() => validateNewTransaction({ ...validTxn, description: description as never })).toThrow('description must be text')
    }
    expect(validateNewTransaction({ ...validTxn, description: '' }).description).toBe('')
    expect(validateNewTransaction({ ...validTxn, description: '  Rent  ' }).description).toBe('  Rent  ')
  })

  it('holds a new description to the same 140 characters an edit has', () => {
    const longest = 'x'.repeat(140)
    expect(validateNewTransaction({ ...validTxn, description: longest }).description).toBe(longest)
    expect(() => validateNewTransaction({ ...validTxn, description: `${longest}x` })).toThrow('140 characters or fewer')
    expect(() => validateBulkTransactions([validTxn, { ...validTxn, description: 'x'.repeat(5000) }])).toThrow(
      'Row 2: description must be 140 characters or fewer',
    )
  })

  it('validates bulk payloads with the same rules', () => {
    expect(validateBulkTransactions([validTxn])).toHaveLength(1)
    expect(() => validateBulkTransactions('nope')).toThrow('transactions array is required')
    expect(() => validateBulkTransactions([{ ...validTxn, amountCents: NaN }])).toThrow(
      'amountCents must be a whole number of cents, not zero',
    )
    // The whole batch is refused, so the message says which row.
    expect(() => validateBulkTransactions([validTxn, { ...validTxn, amountCents: 0 }])).toThrow('Row 2: amountCents')
    expect(() => validateBulkTransactions([validTxn, null])).toThrow('Row 2: transaction must be an object')
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

describe('validateBulkUpdatePatch', () => {
  it('accepts a valid patch with one field', () => {
    expect(validateBulkUpdatePatch({ categoryId: 5 })).toEqual({ categoryId: 5 })
  })

  it('accepts a patch with all five fields', () => {
    const patch = {
      categoryId: 1,
      accountId: 2,
      type: 'income',
      date: '2026-03-15',
      budgetMonth: '2026-03',
    }
    expect(validateBulkUpdatePatch(patch)).toEqual(patch)
  })

  it('rejects null / non-object', () => {
    expect(() => validateBulkUpdatePatch(null)).toThrow('patch is required')
    expect(() => validateBulkUpdatePatch('nope')).toThrow('patch is required')
  })

  it('rejects an empty object', () => {
    expect(() => validateBulkUpdatePatch({})).toThrow('At least one field must be set')
  })

  it('accepts a description and stores it trimmed', () => {
    expect(validateBulkUpdatePatch({ description: '  Netflix ' })).toEqual({ description: 'Netflix' })
  })

  it('rejects a blank or spaces-only description, which would wipe a NOT NULL column', () => {
    expect(() => validateBulkUpdatePatch({ description: '' })).toThrow('description cannot be blank')
    expect(() => validateBulkUpdatePatch({ description: '   ' })).toThrow('description cannot be blank')
  })

  it('rejects a description over 140 characters, and accepts exactly 140', () => {
    expect(() => validateBulkUpdatePatch({ description: 'x'.repeat(141) })).toThrow(
      'description must be 140 characters or fewer',
    )
    expect(validateBulkUpdatePatch({ description: 'x'.repeat(140) })).toEqual({
      description: 'x'.repeat(140),
    })
  })

  it('rejects a description that is not text', () => {
    expect(() => validateBulkUpdatePatch({ description: 42 })).toThrow('description must be text')
    expect(() => validateBulkUpdatePatch({ description: null })).toThrow('description must be text')
  })

  it('rejects disallowed fields', () => {
    expect(() => validateBulkUpdatePatch({ amountCents: 100 })).toThrow('not bulk-editable')
    expect(() => validateBulkUpdatePatch({ notes: 'x' })).toThrow('not bulk-editable')
    expect(() => validateBulkUpdatePatch({ planId: 1 })).toThrow('not bulk-editable')
  })

  it('rejects invalid categoryId / accountId', () => {
    expect(() => validateBulkUpdatePatch({ categoryId: 0 })).toThrow('Invalid categoryId')
    expect(() => validateBulkUpdatePatch({ categoryId: -1 })).toThrow('Invalid categoryId')
    expect(() => validateBulkUpdatePatch({ categoryId: 1.5 })).toThrow('Invalid categoryId')
    expect(() => validateBulkUpdatePatch({ accountId: 0 })).toThrow('Invalid accountId')
  })

  it('rejects invalid type values', () => {
    expect(() => validateBulkUpdatePatch({ type: 'bogus' })).toThrow('Invalid transaction type')
  })

  it('rejects malformed date / budgetMonth', () => {
    expect(() => validateBulkUpdatePatch({ date: '2026-1-1' })).toThrow('date must be YYYY-MM-DD')
    expect(() => validateBulkUpdatePatch({ budgetMonth: '2026-1' })).toThrow(
      'budgetMonth must be YYYY-MM',
    )
  })
})

describe('bulkUpdateTransactions service', () => {
  it('updates multiple transactions via the repository', async () => {
    const repo = inMemoryExpenseRepository(
      {
        accounts: [{ id: 1, name: 'Cash', kind: 'debit', settlement: 'immediate', active: true }],
        categories: [
          { id: 2, name: 'Food', monthlyBudgetCents: 0, sortOrder: 0, active: true },
          { id: 3, name: 'Transport', monthlyBudgetCents: 0, sortOrder: 1, active: true },
        ],
      },
      'owner@example.com',
    )
    const t1 = await repo.insertTransaction('owner@example.com', validTxn)
    const t2 = await repo.insertTransaction('owner@example.com', {
      ...validTxn,
      description: 'Second',
    })
    const result = await bulkUpdateTransactions(repo, 'owner@example.com', [t1.id, t2.id], {
      categoryId: 3,
    })
    expect(result.updated).toBe(2)
    expect(result.transactions.every((t) => t.categoryId === 3)).toBe(true)
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

describe('validateTransactionPatch', () => {
  it('accepts every field the edit form really sends', () => {
    const patch = {
      date: '2026-03-04',
      budgetMonth: '2026-03',
      description: 'Updated description',
      accountId: 1,
      categoryId: 2,
      type: 'expense',
      amountCents: 2500,
      cancelled: true,
      notes: 'a note',
      flagId: 3,
    }
    expect(validateTransactionPatch(patch)).toEqual(patch)
  })

  it('holds a patched description to the length a new one has, and still lets an edit clear it', () => {
    const longest = 'x'.repeat(140)
    expect(validateTransactionPatch({ description: longest })).toEqual({ description: longest })
    expect(validateTransactionPatch({ description: ` ${longest} ` })).toEqual({ description: ` ${longest} ` })
    expect(() => validateTransactionPatch({ description: `${longest}x` })).toThrow('140 characters or fewer')
    expect(() => validateTransactionPatch({ description: 'x'.repeat(1_500_000) })).toThrow('140 characters or fewer')
    expect(validateTransactionPatch({ description: '   ' })).toEqual({ description: '   ' })
  })

  it('holds a patched note to the length a new one has, and still lets an edit clear it', () => {
    const longest = 'n'.repeat(MAX_NOTES_LENGTH)
    expect(validateTransactionPatch({ notes: longest })).toEqual({ notes: longest })
    expect(() => validateTransactionPatch({ notes: `${longest}n` })).toThrow(`${MAX_NOTES_LENGTH} characters or fewer`)
    expect(validateTransactionPatch({ notes: '' })).toEqual({ notes: '' })
    expect(validateTransactionPatch({ notes: null })).toEqual({ notes: null })
    expect(() => validateTransactionPatch({ notes: 5 })).toThrow('notes must be text')
  })

  it('accepts planId and installmentIndex together', () => {
    const patch = { planId: 7, installmentIndex: 3 }
    expect(validateTransactionPatch(patch)).toEqual(patch)
  })

  it('checks values, not only which fields were sent', () => {
    // The names were policed here from the start; the values went to SQLite as
    // given, which made this the one write path looser than create and bulk edit.
    expect(() => validateTransactionPatch({ amountCents: 'lots' })).toThrow('amountCents')
    expect(() => validateTransactionPatch({ amountCents: 0 })).toThrow('amountCents')
    // A negative amount alone cannot be judged without the row's type; that is the
    // repository's check. With the type in the same patch it is judged here.
    expect(validateTransactionPatch({ amountCents: -500 })).toEqual({ amountCents: -500 })
    expect(() => validateTransactionPatch({ amountCents: -500, type: 'expense' })).toThrow('withdrawal')
    expect(validateTransactionPatch({ amountCents: -500, type: 'investment' })).toEqual({ amountCents: -500, type: 'investment' })
    expect(() => validateTransactionPatch({ amountCents: 12.5 })).toThrow('amountCents')
    expect(() => validateTransactionPatch({ date: 'yesterday' })).toThrow('date must be YYYY-MM-DD')
    expect(() => validateTransactionPatch({ budgetMonth: '2026-1' })).toThrow('budgetMonth')
    expect(() => validateTransactionPatch({ type: 'transfer' })).toThrow('Invalid transaction type')
    expect(() => validateTransactionPatch({ cancelled: 'yes' })).toThrow('cancelled')
    expect(() => validateTransactionPatch({ categoryId: 0 })).toThrow('categoryId')
    expect(() => validateTransactionPatch({ accountId: -3 })).toThrow('accountId')
    expect(() => validateTransactionPatch({ description: 42 })).toThrow('description')
  })

  it('keeps null meaningful for the links that use it to clear', () => {
    expect(validateTransactionPatch({ flagId: null, planId: null, notes: null })).toEqual({
      flagId: null,
      planId: null,
      notes: null,
    })
  })

  it('drops keys sent as undefined rather than writing them', () => {
    expect(validateTransactionPatch({ description: 'kept', notes: undefined })).toEqual({
      description: 'kept',
    })
  })

  it('rejects settledBy specifically — excluded outright, not merely ownership-checked', () => {
    expect(() => validateTransactionPatch({ settledBy: 5 })).toThrow(/not patchable/)
    expect(() => validateTransactionPatch({ settledBy: 5 })).toThrow('Field "settledBy" is not patchable')
  })

  it('rejects an arbitrary unknown key', () => {
    expect(() => validateTransactionPatch({ bogus: 'x' })).toThrow('Field "bogus" is not patchable')
  })
})

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
