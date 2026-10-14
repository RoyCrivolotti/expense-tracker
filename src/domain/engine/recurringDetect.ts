import type { Transaction } from '../types'
import { monthsBetweenBudget } from './dates'
import type { OccurrenceGroup } from './recurringTypes'

const MIN_OCCURRENCES = 3

/** Also the identity of a description in the Spending group-by: trimmed, case-folded text. */
export function normalizeDesc(description: string): string {
  return description.trim().toLowerCase()
}

/** One recurring-detection identity per transaction; fixed-spend classification reuses it. */
export function occurrenceKey(txn: Transaction): string {
  return `${normalizeDesc(txn.description)}|${txn.accountId}|${txn.categoryId}|${txn.type}`
}

/** Months from a transaction's calendar month to its assigned budget month. */
function budgetOffset(txn: Transaction): number {
  return monthsBetweenBudget(txn.date.slice(0, 7), txn.budgetMonth)
}

function byDateThenId(a: Transaction, b: Transaction): number {
  return a.date.localeCompare(b.date) || a.id - b.id
}

/**
 * Transactions grouped by identity, with at least three occurrences. A group's dates and offsets
 * run oldest to newest whatever order the rows arrive in (the API sends them newest first), and
 * the group speaks for its newest occurrence.
 */
export function groupTransactions(transactions: Transaction[]): OccurrenceGroup[] {
  const map = new Map<string, OccurrenceGroup>()

  for (const txn of [...transactions].sort(byDateThenId)) {
    if (txn.cancelled) continue
    if (!txn.description.trim()) continue
    // Installment-plan payments are a declared schedule, not a detected pattern.
    if (txn.planId != null) continue

    const key = occurrenceKey(txn)
    const existing = map.get(key)
    if (existing) {
      existing.dates.push(txn.date)
      existing.budgetMonths.add(txn.budgetMonth)
      existing.budgetOffsets.push(budgetOffset(txn))
      existing.amountCents = txn.amountCents
      existing.label = txn.description
    } else {
      map.set(key, {
        key: {
          normalizedDesc: normalizeDesc(txn.description),
          accountId: txn.accountId,
          categoryId: txn.categoryId,
          type: txn.type,
        },
        label: txn.description,
        categoryId: txn.categoryId,
        amountCents: txn.amountCents,
        dates: [txn.date],
        budgetMonths: new Set([txn.budgetMonth]),
        budgetOffsets: [budgetOffset(txn)],
      })
    }
  }
  return [...map.values()].filter((g) => g.dates.length >= MIN_OCCURRENCES)
}
