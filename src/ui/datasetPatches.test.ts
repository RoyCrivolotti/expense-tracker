import { describe, expect, it } from 'vitest'
import type { ExpenseDataset, Transaction } from '../types'
import { defaultExpenseSettings } from '../engine'
import {
  patchAfterAccountDelete,
  patchAfterBulkUpdate,
  patchAfterCategoryDelete,
  patchAfterFlag,
  patchAfterFlagDelete,
} from './datasetPatches'

function dataset(overrides: Partial<ExpenseDataset> = {}): ExpenseDataset {
  return {
    flags: [],
    categories: [],
    accounts: [],
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
    ...overrides,
  }
}

describe('patchAfterBulkUpdate', () => {
  it('replaces matched transactions and re-sorts by date', () => {
    const txn = (id: number, date: string) =>
      ({
        id,
        date,
        budgetMonth: date.slice(0, 7),
        description: `t${id}`,
        accountId: 1,
        categoryId: 1,
        type: 'expense' as const,
        amountCents: 100,
        cancelled: false,
        status: 'posted' as const,
      })
    const ds = dataset({
      transactions: [txn(3, '2026-03-01'), txn(2, '2026-02-01'), txn(1, '2026-01-01')],
    })
    const updated = [{ ...txn(1, '2026-04-01'), categoryId: 5 }]
    const patched = patchAfterBulkUpdate(ds, updated)
    expect(patched.transactions[0]!.id).toBe(1)
    expect(patched.transactions[0]!.date).toBe('2026-04-01')
    expect(patched.transactions[0]!.categoryId).toBe(5)
    expect(patched.transactions[1]!.id).toBe(3)
    expect(patched.transactions[2]!.id).toBe(2)
  })

  it('leaves non-matching transactions unchanged', () => {
    const txn = {
      id: 1,
      date: '2026-01-01',
      budgetMonth: '2026-01',
      description: 'a',
      accountId: 1,
      categoryId: 1,
      type: 'expense' as const,
      amountCents: 100,
      cancelled: false,
      status: 'posted' as const,
    }
    const ds = dataset({ transactions: [txn] })
    const patched = patchAfterBulkUpdate(ds, [])
    expect(patched.transactions).toEqual([txn])
  })
})

describe('patchAfterCategoryDelete', () => {
  it('removes the source category and reassigns referencing transactions/plans to the target', () => {
    const ds = dataset({
      categories: [
        { id: 1, name: 'Food', monthlyBudgetCents: 0, sortOrder: 0, active: true },
        { id: 2, name: 'Dining', monthlyBudgetCents: 0, sortOrder: 1, active: true },
      ],
      transactions: [
        {
          id: 1,
          date: '2026-01-01',
          budgetMonth: '2026-01',
          description: 'a',
          accountId: 1,
          categoryId: 1,
          type: 'expense',
          amountCents: -100,
          cancelled: false,
          status: 'posted',
        },
      ],
      installmentPlans: [
        {
          id: 1,
          description: 'plan',
          totalCount: 12,
          amountCents: 100,
          accountId: 1,
          categoryId: 1,
          type: 'expense',
          anchorBudgetMonth: '2026-01',
          startInstallmentIndex: 1,
          active: true,
        },
      ],
    })

    const patched = patchAfterCategoryDelete(ds, 1, { reassignedToId: 2 })

    expect(patched.categories.map((c) => c.id)).toEqual([2])
    expect(patched.transactions[0]!.categoryId).toBe(2)
    expect(patched.installmentPlans[0]!.categoryId).toBe(2)
  })

  it('adds the inline-created category as the reassign target', () => {
    const ds = dataset({
      categories: [{ id: 1, name: 'Food', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
      transactions: [
        {
          id: 1,
          date: '2026-01-01',
          budgetMonth: '2026-01',
          description: 'a',
          accountId: 1,
          categoryId: 1,
          type: 'expense',
          amountCents: -100,
          cancelled: false,
          status: 'posted',
        },
      ],
    })
    const createdCategory = { id: 2, name: 'Groceries', monthlyBudgetCents: 0, sortOrder: 1, active: true }

    const patched = patchAfterCategoryDelete(ds, 1, { reassignedToId: 2, createdCategory })

    expect(patched.categories).toEqual([createdCategory])
    expect(patched.transactions[0]!.categoryId).toBe(2)
  })

  it('just removes the category when it was unused (no reassign)', () => {
    const ds = dataset({
      categories: [
        { id: 1, name: 'Food', monthlyBudgetCents: 0, sortOrder: 0, active: true },
        { id: 2, name: 'Dining', monthlyBudgetCents: 0, sortOrder: 1, active: true },
      ],
    })

    const patched = patchAfterCategoryDelete(ds, 1, { reassignedToId: null })

    expect(patched.categories.map((c) => c.id)).toEqual([2])
  })
})

describe('patchAfterAccountDelete', () => {
  it('removes the source account and reassigns referencing transactions/plans/statements to the target', () => {
    const ds = dataset({
      accounts: [
        { id: 1, name: 'Checking', kind: 'debit', settlement: 'immediate', active: true },
        { id: 2, name: 'Savings', kind: 'debit', settlement: 'immediate', active: true },
      ],
      transactions: [
        {
          id: 1,
          date: '2026-01-01',
          budgetMonth: '2026-01',
          description: 'a',
          accountId: 1,
          categoryId: 1,
          type: 'expense',
          amountCents: -100,
          cancelled: false,
          status: 'posted',
        },
      ],
      installmentPlans: [
        {
          id: 1,
          description: 'plan',
          totalCount: 12,
          amountCents: 100,
          accountId: 1,
          categoryId: 1,
          type: 'expense',
          anchorBudgetMonth: '2026-01',
          startInstallmentIndex: 1,
          active: true,
        },
      ],
      accountStatements: [{ accountId: 1, yearMonth: '2026-01', paid: false }],
    })

    const patched = patchAfterAccountDelete(ds, 1, { reassignedToId: 2 })

    expect(patched.accounts.map((a) => a.id)).toEqual([2])
    expect(patched.transactions[0]!.accountId).toBe(2)
    expect(patched.installmentPlans[0]!.accountId).toBe(2)
    expect(patched.accountStatements).toEqual([{ accountId: 2, yearMonth: '2026-01', paid: false }])
  })

  it('drops the source statement for a month the target already has, keeping the target as-is', () => {
    const ds = dataset({
      accounts: [
        { id: 1, name: 'Checking', kind: 'credit', settlement: 'deferred', active: true },
        { id: 2, name: 'Card', kind: 'credit', settlement: 'deferred', active: true },
      ],
      accountStatements: [
        { accountId: 1, yearMonth: '2026-01', paid: false },
        { accountId: 1, yearMonth: '2026-02', paid: false },
        { accountId: 2, yearMonth: '2026-01', paid: true, paidOn: '2026-02-01' },
      ],
    })

    const patched = patchAfterAccountDelete(ds, 1, { reassignedToId: 2 })

    expect(patched.accountStatements).toEqual(
      expect.arrayContaining([
        { accountId: 2, yearMonth: '2026-01', paid: true, paidOn: '2026-02-01' },
        { accountId: 2, yearMonth: '2026-02', paid: false },
      ]),
    )
    expect(patched.accountStatements).toHaveLength(2)
  })

  it('adds the inline-created account as the reassign target', () => {
    const ds = dataset({
      accounts: [{ id: 1, name: 'Checking', kind: 'debit', settlement: 'immediate', active: true }],
      transactions: [
        {
          id: 1,
          date: '2026-01-01',
          budgetMonth: '2026-01',
          description: 'a',
          accountId: 1,
          categoryId: 1,
          type: 'expense',
          amountCents: -100,
          cancelled: false,
          status: 'posted',
        },
      ],
    })
    const createdAccount = { id: 2, name: 'New checking', kind: 'debit' as const, settlement: 'immediate' as const, active: true }

    const patched = patchAfterAccountDelete(ds, 1, { reassignedToId: 2, createdAccount })

    expect(patched.accounts).toEqual([createdAccount])
    expect(patched.transactions[0]!.accountId).toBe(2)
  })

  it('just removes the account when it was unused (no reassign)', () => {
    const ds = dataset({
      accounts: [
        { id: 1, name: 'Checking', kind: 'debit', settlement: 'immediate', active: true },
        { id: 2, name: 'Savings', kind: 'debit', settlement: 'immediate', active: true },
      ],
    })

    const patched = patchAfterAccountDelete(ds, 1, { reassignedToId: null })

    expect(patched.accounts.map((a) => a.id)).toEqual([2])
  })

  it('clears settings.defaultAccountId when the deleted (unused) account was the default', () => {
    const ds = dataset({
      accounts: [
        { id: 1, name: 'Checking', kind: 'debit', settlement: 'immediate', active: true },
        { id: 2, name: 'Savings', kind: 'debit', settlement: 'immediate', active: true },
      ],
      settings: { ...defaultExpenseSettings(), defaultAccountId: 1 },
    })

    const patched = patchAfterAccountDelete(ds, 1, { reassignedToId: null })

    expect(patched.settings.defaultAccountId).toBeNull()
  })

  it('moves settings.defaultAccountId to the reassign target when the deleted account was the default', () => {
    const ds = dataset({
      accounts: [
        { id: 1, name: 'Checking', kind: 'debit', settlement: 'immediate', active: true },
        { id: 2, name: 'Savings', kind: 'debit', settlement: 'immediate', active: true },
      ],
      settings: { ...defaultExpenseSettings(), defaultAccountId: 1 },
    })

    const patched = patchAfterAccountDelete(ds, 1, { reassignedToId: 2 })

    expect(patched.settings.defaultAccountId).toBe(2)
  })

  it('leaves settings.defaultAccountId untouched when a different account is deleted', () => {
    const ds = dataset({
      accounts: [
        { id: 1, name: 'Checking', kind: 'debit', settlement: 'immediate', active: true },
        { id: 2, name: 'Savings', kind: 'debit', settlement: 'immediate', active: true },
      ],
      settings: { ...defaultExpenseSettings(), defaultAccountId: 2 },
    })

    const patched = patchAfterAccountDelete(ds, 1, { reassignedToId: null })

    expect(patched.settings.defaultAccountId).toBe(2)
  })
})

describe('flag patches', () => {
  const work = { id: 1, name: 'Work travel', color: '#6366f1', sortOrder: 1, active: true }
  const tax = { id: 2, name: 'Tax', color: '#10b981', sortOrder: 0, active: true }

  function txn(id: number, flagId?: number): Transaction {
    return {
      id,
      date: '2026-05-01',
      budgetMonth: '2026-05',
      description: 'Hotel',
      accountId: 1,
      categoryId: 1,
      type: 'expense',
      amountCents: 1_000,
      cancelled: false,
      status: 'posted',
      ...(flagId != null ? { flagId } : {}),
    }
  }

  it('inserts a new flag in sort order', () => {
    const next = patchAfterFlag(dataset({ flags: [work] }), tax)

    expect(next.flags.map((f) => f.id)).toEqual([2, 1])
  })

  it('replaces an existing flag rather than duplicating it', () => {
    const next = patchAfterFlag(dataset({ flags: [work] }), { ...work, name: 'Client travel' })

    expect(next.flags).toHaveLength(1)
    expect(next.flags[0]?.name).toBe('Client travel')
  })

  it('does not mutate the dataset it was given', () => {
    const before = dataset({ flags: [work] })
    patchAfterFlag(before, tax)

    expect(before.flags).toHaveLength(1)
  })

  it('clears the flag from its transactions when it is deleted', () => {
    const before = dataset({ flags: [work, tax], transactions: [txn(1, 1), txn(2, 2)] })
    const next = patchAfterFlagDelete(before, 1)

    expect(next.flags.map((f) => f.id)).toEqual([2])
    expect(next.transactions[0]).not.toHaveProperty('flagId')
    expect(next.transactions[1]?.flagId).toBe(2)
  })

  it('omits the flagId key rather than setting it undefined', () => {
    // exactOptionalPropertyTypes means an explicit `undefined` is not the same
    // as absent, and JSON round-trips would disagree with the server.
    const next = patchAfterFlagDelete(dataset({ flags: [work], transactions: [txn(1, 1)] }), 1)

    expect(Object.keys(next.transactions[0] ?? {})).not.toContain('flagId')
  })

})
