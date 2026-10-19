import { describe, expect, it } from 'vitest'
import { makeDataset, makeFlag, makeLabel, makeTransaction } from '../../testing/factories'
import type { InstallmentPlan } from '../types'
import { usageFromDataset } from './recordUsage'

const plan = (over: Partial<InstallmentPlan>): InstallmentPlan => ({
  id: 1,
  description: 'Sofa',
  totalCount: 3,
  amountCents: 100,
  accountId: 1,
  categoryId: 1,
  type: 'expense',
  anchorBudgetMonth: '2026-01',
  startInstallmentIndex: 1,
  active: true,
  ...over,
})

describe('usageFromDataset', () => {
  const dataset = makeDataset({
    categories: [
      { id: 2, name: 'B', monthlyBudgetCents: 0, sortOrder: 1, active: true },
      { id: 1, name: 'A', monthlyBudgetCents: 0, sortOrder: 0, active: true },
    ],
    accounts: [
      { id: 1, name: 'Debit', kind: 'debit', settlement: 'immediate', active: true },
      { id: 2, name: 'Card', kind: 'credit', settlement: 'deferred', active: true },
    ],
    flags: [makeFlag({ id: 1 }), makeFlag({ id: 2 })],
    labels: [makeLabel({ id: 7 }), makeLabel({ id: 8 })],
    transactions: [
      makeTransaction({ id: 1, categoryId: 1, accountId: 1, flagId: 1, labelIds: [7] }),
      makeTransaction({ id: 2, categoryId: 1, accountId: 2, cancelled: true, status: 'cancelled', labelIds: [7, 7] }),
      makeTransaction({ id: 3, categoryId: 2, accountId: 2, flagId: 1 }),
      makeTransaction({ id: 4, categoryId: 99, accountId: 99, labelIds: [8] }),
    ],
    installmentPlans: [plan({ id: 1, categoryId: 1, accountId: 2 }), plan({ id: 2, categoryId: 1, accountId: 2 })],
    accountStatements: [
      { accountId: 2, yearMonth: '2026-01', paid: true },
      { accountId: 2, yearMonth: '2026-02', paid: false },
    ],
  })
  const usage = usageFromDataset(dataset)

  it('counts the transactions of any status, and the plans, that name a category', () => {
    expect(usage.categories).toEqual([
      { id: 1, transactions: 2, plans: 2 },
      { id: 2, transactions: 1, plans: 0 },
    ])
  })

  it('counts the transactions, plans and statements that name an account', () => {
    expect(usage.accounts).toEqual([
      { id: 1, transactions: 1, plans: 0, statements: 0 },
      { id: 2, transactions: 2, plans: 2, statements: 2 },
    ])
  })

  it('counts a row once per flag and once per label however the label is listed', () => {
    expect(usage.flags).toEqual([{ id: 1, transactions: 2 }, { id: 2, transactions: 0 }])
    expect(usage.labels).toEqual([{ id: 7, transactions: 2 }, { id: 8, transactions: 1 }])
  })

  it('lists only records that exist, so a row naming a category or account that is gone adds to nothing', () => {
    expect(usage.categories.map((c) => c.id)).toEqual([1, 2])
    expect(usage.accounts.map((a) => a.id)).toEqual([1, 2])
  })

  it('answers zeros for an empty dataset', () => {
    expect(usageFromDataset(makeDataset())).toEqual({ categories: [], accounts: [], flags: [], labels: [] })
  })
})
