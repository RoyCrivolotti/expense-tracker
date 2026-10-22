import { describe, expect, it } from 'vitest'
import { usageFromDataset } from '../../domain/engine/recordUsage'
import type { ExpenseDataset, InstallmentPlan } from '../../types'
import { adversarialLedger } from '../../testing/adversarialLedger'
import { makeDataset, makeFlag, makeLabel, makeTransaction } from '../../testing/factories'
import { randomLedger } from '../../testing/randomLedger'
import { usageCount } from '../ledgerUsage'
import { type UsageKind, heldCount } from './recordUsage'

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

describe('heldCount', () => {
  it('is zero for a record referenced by nothing', () => {
    const ds = makeDataset({ categories: [category(1)], accounts: [account(1)], flags: [makeFlag({ id: 1 })], labels: [makeLabel({ id: 1 })] })
    for (const kind of ['category', 'account', 'flag', 'label'] as const) expect(heldCount(ds, kind, 1)).toBe(0)
  })

  it('counts the transactions and installment plans that name a category', () => {
    const ds = makeDataset({
      categories: [category(5), category(9)],
      transactions: [makeTransaction({ id: 1, categoryId: 5 }), makeTransaction({ id: 2, categoryId: 9 })],
      installmentPlans: [plan(5, 1)],
    })
    expect(heldCount(ds, 'category', 5)).toBe(2)
    expect(heldCount(ds, 'category', 9)).toBe(1)
  })

  it('counts the transactions, installment plans and account statements that name an account', () => {
    const ds = makeDataset({
      accounts: [account(7)],
      transactions: [makeTransaction({ id: 1, accountId: 7 })],
      installmentPlans: [plan(1, 7)],
      accountStatements: [{ accountId: 7, yearMonth: '2026-01', paid: false }],
    })
    expect(heldCount(ds, 'account', 7)).toBe(3)
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
    expect(heldCount(ds, 'flag', 3)).toBe(2)
    expect(heldCount(ds, 'label', 4)).toBe(2)
    expect(heldCount(ds, 'label', 5)).toBe(1)
  })

  it('equals what the engine counts for every record of ledgers that have all of them, which is what the server answers', () => {
    const idsOf = (ds: ExpenseDataset, kind: UsageKind) =>
      ({ category: ds.categories, account: ds.accounts, flag: ds.flags, label: ds.labels })[kind].map((record) => record.id)
    let compared = 0
    for (const ds of [adversarialLedger(), randomLedger(5), randomLedger(1), randomLedger(2)]) {
      const reference = usageFromDataset(ds)
      for (const kind of ['category', 'account', 'flag', 'label'] as const) {
        for (const id of idsOf(ds, kind)) {
          expect(heldCount(ds, kind, id), `${kind} ${id}`).toBe(usageCount(reference, kind, id))
          compared += 1
        }
      }
    }
    expect(compared).toBeGreaterThan(40)
  })
})
