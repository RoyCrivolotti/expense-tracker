import type { Transaction } from '../types'
import { monthsBetweenBudget } from './dates'
import type { GroupKey, OccurrenceGroup } from './recurringTypes'

const MIN_OCCURRENCES = 3

/** Also the identity of a description in the Spending group-by: trimmed, case-folded text. */
export function normalizeDesc(description: string): string {
  return description.trim().toLowerCase()
}

/** One recurring-detection identity per transaction; fixed-spend classification reuses it. */
export function occurrenceKey(txn: Transaction): string {
  return `${normalizeDesc(txn.description)}|${txn.accountId}|${txn.categoryId}|${txn.type}`
}

/** The identity of a group as one string, the same text `occurrenceKey` gives each of its rows. */
export function groupKeyString(key: GroupKey): string {
  return `${key.normalizedDesc}|${key.accountId}|${key.categoryId}|${key.type}`
}

/** Months from a transaction's calendar month to its assigned budget month. */
function budgetOffset(txn: Transaction): number {
  return monthsBetweenBudget(txn.date.slice(0, 7), txn.budgetMonth)
}

/** Whether a row can be an occurrence of a series: not cancelled, described, and not a plan's payment. */
function countsAsOccurrence(txn: Transaction): boolean {
  if (txn.cancelled) return false
  if (!txn.description.trim()) return false
  // Installment-plan payments are a declared schedule, not a detected pattern.
  return txn.planId == null
}

/** The date of the newest charge of each series, by `groupKeyString`, whatever order the rows arrive in. */
export function newestChargeBySeries(transactions: Transaction[]): Map<string, string> {
  const newest = new Map<string, string>()
  for (const txn of transactions) {
    if (!countsAsOccurrence(txn)) continue
    const key = occurrenceKey(txn)
    const seen = newest.get(key)
    if (seen === undefined || txn.date > seen) newest.set(key, txn.date)
  }
  return newest
}

function byDateThenId(a: Transaction, b: Transaction): number {
  return a.date.localeCompare(b.date) || a.id - b.id
}

/**
 * Transactions grouped by identity, with at least three occurrences, in the order the groups first
 * appear in `transactions` (the Analytics fixed-cost list breaks ties by it). Within a group the
 * dates and offsets run oldest to newest whatever order the rows arrive in (the API sends them
 * newest first), and the group speaks for its newest row.
 */
export function groupTransactions(transactions: Transaction[]): OccurrenceGroup[] {
  const rowsByKey = new Map<string, Transaction[]>()
  for (const txn of transactions) {
    if (!countsAsOccurrence(txn)) continue

    const key = occurrenceKey(txn)
    const rows = rowsByKey.get(key)
    if (rows) rows.push(txn)
    else rowsByKey.set(key, [txn])
  }

  const groups: OccurrenceGroup[] = []
  for (const rows of rowsByKey.values()) {
    if (rows.length < MIN_OCCURRENCES) continue
    const oldestFirst = [...rows].sort(byDateThenId)
    const newest = oldestFirst[oldestFirst.length - 1]!
    groups.push({
      key: {
        normalizedDesc: normalizeDesc(newest.description),
        accountId: newest.accountId,
        categoryId: newest.categoryId,
        type: newest.type,
      },
      label: newest.description,
      categoryId: newest.categoryId,
      amountCents: newest.amountCents,
      dates: oldestFirst.map((txn) => txn.date),
      budgetMonths: new Set(oldestFirst.map((txn) => txn.budgetMonth)),
      budgetOffsets: oldestFirst.map(budgetOffset),
    })
  }
  return groups
}
