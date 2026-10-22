import { describe, expect, it } from 'vitest'
import { usageFromDataset } from '../../domain/engine/recordUsage'
import type { ExpenseDataset, InstallmentPlan } from '../../types'
import { makeDataset, makeFlag, makeLabel, makeTransaction } from '../../testing/factories'
import { usageCount } from './recordUsage'

const category = (id: number) => ({ id, name: `Category ${id}`, monthlyBudgetCents: 0, sortOrder: id, active: true })
const account = (id: number) => ({ id, name: `Account ${id}`, kind: 'debit' as const, settlement: 'immediate' as const, active: true })
const plan = (categoryId: number, accountId: number): InstallmentPlan => ({
  id: 1,
  description: 'plan',
  totalCount: 12,
  amountCents: 100,
  accountId,
  categoryId,
  type: 'expense',
  anchorBudgetMonth: '2026-01',
  startInstallmentIndex: 1,
  active: true,
})

const counted = (ds: ExpenseDataset) => usageFromDataset(ds)

describe('usageCount', () => {
  it('is null before the counts have been read, which is not zero', () => {
    expect(usageCount(null, 'category', 1)).toBeNull()
    expect(usageCount(null, 'label', 1)).toBeNull()
  })

  it('is zero for a record referenced by nothing', () => {
    const ds = makeDataset({ categories: [category(1)], accounts: [account(1)], flags: [makeFlag({ id: 1 })], labels: [makeLabel({ id: 1 })] })
    for (const kind of ['category', 'account', 'flag', 'label'] as const) expect(usageCount(counted(ds), kind, 1)).toBe(0)
  })

  it('counts the transactions and installment plans that name a category', () => {
    const ds = makeDataset({
      categories: [category(5), category(9)],
      transactions: [makeTransaction({ id: 1, categoryId: 5 }), makeTransaction({ id: 2, categoryId: 9 })],
      installmentPlans: [plan(5, 1)],
    })
    expect(usageCount(counted(ds), 'category', 5)).toBe(2)
    expect(usageCount(counted(ds), 'category', 9)).toBe(1)
  })

  it('counts the transactions, installment plans and account statements that name an account', () => {
    const ds = makeDataset({
      accounts: [account(7)],
      transactions: [makeTransaction({ id: 1, accountId: 7 })],
      installmentPlans: [plan(1, 7)],
      accountStatements: [{ accountId: 7, yearMonth: '2026-01', paid: false }],
    })
    expect(usageCount(counted(ds), 'account', 7)).toBe(3)
  })

  it('counts the transactions a flag is on, and those a label is on once each', () => {
    const ds = makeDataset({
      flags: [makeFlag({ id: 3 })],
      labels: [makeLabel({ id: 4 }), makeLabel({ id: 5 })],
      transactions: [
        makeTransaction({ id: 1, flagId: 3, labelIds: [4, 5] }),
        makeTransaction({ id: 2, flagId: 3, labelIds: [4] }),
        makeTransaction({ id: 3 }),
      ],
    })
    expect(usageCount(counted(ds), 'flag', 3)).toBe(2)
    expect(usageCount(counted(ds), 'label', 4)).toBe(2)
    expect(usageCount(counted(ds), 'label', 5)).toBe(1)
  })

  it('is zero for a record the counts do not list, as the server’s own list does for none that exists', () => {
    expect(usageCount(counted(makeDataset()), 'category', 99)).toBe(0)
  })
})
