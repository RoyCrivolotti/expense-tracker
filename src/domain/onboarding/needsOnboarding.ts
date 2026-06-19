import type { ExpenseDataset } from '../types'

/** True when the tenant has no categories or accounts yet (first-run setup). */
export function needsOnboarding(dataset: ExpenseDataset): boolean {
  return dataset.categories.length === 0 && dataset.accounts.length === 0
}
