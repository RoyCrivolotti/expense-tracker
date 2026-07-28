import { describe, expect, it } from 'vitest'
import type { ExpenseDataset } from '../types'
import { defaultExpenseSettings } from '../engine'
import { patchAfterAccountDelete, patchAfterCategoryDelete } from './datasetPatches'

function dataset(overrides: Partial<ExpenseDataset> = {}): ExpenseDataset {
  return {
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
