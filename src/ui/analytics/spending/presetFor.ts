import type { SpendingGroupBy, SpendingGroupRow } from '../../../engine'
import type { TransactionsEntry } from '../../tabs/transactionsEntry'

/** The Transactions filter preset for a row, or null where fixedness is derived, not stored. */
export function presetFor(
  groupBy: SpendingGroupBy,
  row: SpendingGroupRow,
  month: string,
): TransactionsEntry | null {
  if (groupBy === 'category') return { categoryId: Number(row.key), month }
  if (groupBy === 'label') return { labelIds: [Number(row.key)], month }
  // Substring query: exact-match is not a filter the list has; close enough, and visible.
  if (groupBy === 'merchant') return { query: row.name, month }
  return null
}
