import type { Transaction, TxnStatus } from '../types'

export interface TxnFilter {
  month?: string
  categoryId?: number
  accountId?: number
  type?: Transaction['type'] | 'all'
  status?: TxnStatus | 'all'
  /** ISO date range on calendar date (inclusive). When set, `month` is ignored. */
  dateFrom?: string
  dateTo?: string
  /** Case-insensitive substring match against the description and notes. */
  query?: string
}

function matchesQuery(txn: Transaction, query: string): boolean {
  const haystack = `${txn.description} ${txn.notes ?? ''}`.toLowerCase()
  return haystack.includes(query.toLowerCase())
}

function matchesPeriod(txn: Transaction, filter: TxnFilter): boolean {
  if (filter.dateFrom || filter.dateTo) {
    if (filter.dateFrom && txn.date < filter.dateFrom) return false
    if (filter.dateTo && txn.date > filter.dateTo) return false
    return true
  }
  if (filter.month && txn.budgetMonth !== filter.month) return false
  return true
}

function matchesTypeAndStatus(txn: Transaction, filter: TxnFilter): boolean {
  if (filter.type && filter.type !== 'all' && txn.type !== filter.type) return false
  if (filter.status && filter.status !== 'all' && txn.status !== filter.status) return false
  return true
}

function matchesDimensions(txn: Transaction, filter: TxnFilter): boolean {
  if (filter.categoryId != null && txn.categoryId !== filter.categoryId) return false
  if (filter.accountId != null && txn.accountId !== filter.accountId) return false
  if (!matchesTypeAndStatus(txn, filter)) return false
  if (filter.query && !matchesQuery(txn, filter.query)) return false
  return true
}

/** Filter then sort newest first (by calendar date, then id for stability). */
export function filterTransactions(transactions: Transaction[], filter: TxnFilter): Transaction[] {
  return transactions
    .filter((txn) => matchesPeriod(txn, filter) && matchesDimensions(txn, filter))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
}

const LIMIT = 8

function byDateDesc(a: Transaction, b: Transaction): number {
  return b.date.localeCompare(a.date) || b.id - a.id
}

function byCreatedDesc(a: Transaction, b: Transaction): number {
  const ca = a.createdAt ?? ''
  const cb = b.createdAt ?? ''
  if (ca !== cb) return cb.localeCompare(ca)
  return b.id - a.id
}

/** Last N transactions by calendar date (global, all budget months). */
export function latestTransactions(transactions: Transaction[], limit = LIMIT): Transaction[] {
  return [...transactions].sort(byDateDesc).slice(0, limit)
}

/** Last N transactions by when they were first saved (global). */
export function recentlyAdded(transactions: Transaction[], limit = LIMIT): Transaction[] {
  return [...transactions].sort(byCreatedDesc).slice(0, limit)
}

export interface DayGroup {
  date: string
  transactions: Transaction[]
}

/** Net expense total for a list (expense − refund; excludes income and investments). */
export function netSpendCents(transactions: Transaction[]): number {
  let total = 0
  for (const txn of transactions) {
    if (txn.type === 'income' || txn.type === 'investment') continue
    total += txn.type === 'refund' ? -txn.amountCents : txn.amountCents
  }
  return total
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
