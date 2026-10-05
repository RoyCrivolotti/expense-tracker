import type { AnalyticsBasis, SpendingGroupBy, SpendingGroupRow } from '../../../engine'
import type { TransactionsEntry } from '../../tabs/transactionsEntry'

/**
 * The Transactions filter preset for a row, or null where fixedness is derived, not stored.
 * The paid basis lists posted rows only, so the list sums to the row's number. The committed
 * basis also counts unpaid card charges, and the list has no "everything but cancelled"
 * status, so it shows all of them.
 */
export function presetFor(
  groupBy: SpendingGroupBy,
  row: SpendingGroupRow,
  month: string,
  basis: AnalyticsBasis,
): TransactionsEntry | null {
  const status = basis === 'paid' ? ({ status: 'posted' } as const) : {}
  if (groupBy === 'category') return { categoryId: Number(row.key), month, ...status }
  if (groupBy === 'label') return { labelIds: [Number(row.key)], month, ...status }
  // Substring query: exact-match is not a filter the list has; close enough, and visible.
  if (groupBy === 'merchant') return { query: row.name, month, ...status }
  return null
}
