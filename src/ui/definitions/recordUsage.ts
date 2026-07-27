import type { ExpenseDataset } from '../../types'

/** How many transactions/plans reference a category — mirrors the server's delete usage check. */
export function categoryUsageCount(dataset: ExpenseDataset, id: number): number {
  const txns = dataset.transactions.filter((t) => t.categoryId === id).length
  const plans = dataset.installmentPlans.filter((p) => p.categoryId === id).length
  return txns + plans
}

/** How many transactions/plans/statements reference an account — mirrors the server's delete usage check. */
export function accountUsageCount(dataset: ExpenseDataset, id: number): number {
  const txns = dataset.transactions.filter((t) => t.accountId === id).length
  const plans = dataset.installmentPlans.filter((p) => p.accountId === id).length
  const statements = dataset.accountStatements.filter((s) => s.accountId === id).length
  return txns + plans + statements
}
