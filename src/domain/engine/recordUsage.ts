/**
 * How many records point at each category, account, flag and label, from a whole dataset: the reference
 * for what `GET /api/expenses/usage` answers. The Settings lists show these counts and ask for a
 * reassignment before deleting a record that has any, which is what the server checks too
 * (`countCategoryUsage` and `countAccountUsage` in `dbConfig.ts`): a record is in use when a transaction of
 * any status, an instalment plan or (for an account) a month statement names it.
 */
import type { Usage } from '../data/usage'
import type { ExpenseDataset } from '../types'

const byId = (a: { id: number }, b: { id: number }): number => a.id - b.id

function tally<T>(items: readonly T[], keys: (item: T) => Iterable<number>): Map<number, number> {
  const counts = new Map<number, number>()
  for (const item of items) {
    for (const key of keys(item)) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

export function usageFromDataset(
  d: Pick<
    ExpenseDataset,
    'categories' | 'accounts' | 'flags' | 'labels' | 'transactions' | 'installmentPlans' | 'accountStatements'
  >,
): Usage {
  const txByCategory = tally(d.transactions, (t) => [t.categoryId])
  const txByAccount = tally(d.transactions, (t) => [t.accountId])
  const txByFlag = tally(d.transactions, (t) => (t.flagId === undefined ? [] : [t.flagId]))
  const txByLabel = tally(d.transactions, (t) => new Set(t.labelIds ?? []))
  const plansByCategory = tally(d.installmentPlans, (p) => [p.categoryId])
  const plansByAccount = tally(d.installmentPlans, (p) => [p.accountId])
  const statementsByAccount = tally(d.accountStatements, (s) => [s.accountId])
  return {
    categories: d.categories
      .map((c) => ({ id: c.id, transactions: txByCategory.get(c.id) ?? 0, plans: plansByCategory.get(c.id) ?? 0 }))
      .sort(byId),
    accounts: d.accounts
      .map((a) => ({
        id: a.id,
        transactions: txByAccount.get(a.id) ?? 0,
        plans: plansByAccount.get(a.id) ?? 0,
        statements: statementsByAccount.get(a.id) ?? 0,
      }))
      .sort(byId),
    flags: d.flags.map((f) => ({ id: f.id, transactions: txByFlag.get(f.id) ?? 0 })).sort(byId),
    labels: d.labels.map((l) => ({ id: l.id, transactions: txByLabel.get(l.id) ?? 0 })).sort(byId),
  }
}
