/**
 * Transaction querying: filtering and grouping by day for the list views.
 */
import type { Transaction, TxnStatus } from '../types'

export interface TxnFilter {
  month?: string
  categoryId?: number
  accountId?: number
  status?: TxnStatus | 'all'
  /** Case-insensitive substring match against the description and notes. */
  query?: string
}

function matchesQuery(txn: Transaction, query: string): boolean {
  const haystack = `${txn.description} ${txn.notes ?? ''}`.toLowerCase()
  return haystack.includes(query.toLowerCase())
}

function matches(txn: Transaction, filter: TxnFilter): boolean {
  if (filter.month && txn.budgetMonth !== filter.month) return false
  if (filter.categoryId != null && txn.categoryId !== filter.categoryId) return false
  if (filter.accountId != null && txn.accountId !== filter.accountId) return false
  if (filter.status && filter.status !== 'all' && txn.status !== filter.status) return false
  if (filter.query && !matchesQuery(txn, filter.query)) return false
  return true
}

/** Filter then sort newest first (by calendar date, then id for stability). */
export function filterTransactions(transactions: Transaction[], filter: TxnFilter): Transaction[] {
  return transactions
    .filter((txn) => matches(txn, filter))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
}

export interface DayGroup {
  date: string
  transactions: Transaction[]
}

/** Group an already-sorted list into day buckets, preserving order. */
export function groupByDay(transactions: Transaction[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const txn of transactions) {
    const last = groups[groups.length - 1]
    if (last && last.date === txn.date) last.transactions.push(txn)
    else groups.push({ date: txn.date, transactions: [txn] })
  }
  return groups
}
