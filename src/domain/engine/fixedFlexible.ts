/**
 * Fixed against flexible spending, detected rather than tagged: a transaction is
 * fixed when it settles an instalment plan or belongs to a recurring pattern the
 * detector already trusts (≥3 occurrences at ≥0.6 regularity). Detection can
 * misfire (it misses annual bills), so anything built on this split keeps the
 * underlying transactions one tap away rather than asking to be believed.
 */
import type { Transaction } from '../types'
import { daysBetween } from './dates'
import { groupTransactions, normalizeDesc, occurrenceKey } from './recurringDetect'
import { classifyFrequency, regularityScore } from './recurringPredict'
import type { GroupKey, OccurrenceGroup } from './recurringTypes'
import { type AnalyticsBasis, type SameDaysCut, basisOptions, signedExpense, withinCut } from './analyticsPeriod'

const MIN_REGULARITY = 0.6

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

function gapsOf(group: OccurrenceGroup): number[] {
  const sorted = [...group.dates].sort()
  return sorted.slice(1).map((d, i) => daysBetween(sorted[i]!, d))
}

/** Whether a grouped pattern is regular enough to call its members fixed spend. */
function isRecurringGroup(group: OccurrenceGroup): boolean {
  const gaps = gapsOf(group)
  if (gaps.length === 0) return false
  const frequency = classifyFrequency(median(gaps))
  // Weekly rhythm is a habit, not an obligation: weekly groceries are exactly
  // the spending the pace clock exists to watch.
  if (!frequency || frequency === 'weekly') return false
  return regularityScore(gaps) >= MIN_REGULARITY
}

/** The recurring groups the fixed-spend split trusts (plan rows are fixed separately). */
export function recurringFixedGroups(transactions: Transaction[]): OccurrenceGroup[] {
  return groupTransactions(transactions).filter(isRecurringGroup)
}

export interface FixedSpendClassifier {
  isFixed(txn: Transaction): boolean
}

function keyString(key: GroupKey): string {
  return `${key.normalizedDesc}|${key.accountId}|${key.categoryId}|${key.type}`
}

/** Build the classifier once per dataset; it is a per-transaction set lookup after that. */
export function classifyFixedSpend(transactions: Transaction[]): FixedSpendClassifier {
  const fixedKeys = new Set(recurringFixedGroups(transactions).map((g) => keyString(g.key)))
  // A refund keys by its own type, so it would never match the expense pattern it
  // repays: the refund of a fixed charge is fixed money coming back, not flexible.
  const matches = (txn: Transaction): boolean => {
    if (fixedKeys.has(occurrenceKey(txn))) return true
    if (txn.type !== 'refund') return false
    return fixedKeys.has(
      keyString({
        normalizedDesc: normalizeDesc(txn.description),
        accountId: txn.accountId,
        categoryId: txn.categoryId,
        type: 'expense',
      }),
    )
  }
  return {
    isFixed: (txn) => txn.planId != null || matches(txn),
  }
}

export interface FixedFlexibleSplit {
  fixedCents: number
  flexibleCents: number
}

/**
 * Net expense of a budget month split into fixed and flexible, through an
 * optional same-days cut (see `sameDaysCut`).
 */
export function splitFixedFlexible(
  transactions: Transaction[],
  classifier: FixedSpendClassifier,
  month: string,
  basis: AnalyticsBasis,
  cut: SameDaysCut | null = null,
): FixedFlexibleSplit {
  const opts = basisOptions(basis)
  let fixedCents = 0
  let flexibleCents = 0
  for (const txn of transactions) {
    if (txn.budgetMonth !== month) continue
    if (!withinCut(txn.date, month, cut)) continue
    const signed = signedExpense(txn, opts)
    if (signed === null) continue
    if (classifier.isFixed(txn)) fixedCents += signed
    else flexibleCents += signed
  }
  return { fixedCents, flexibleCents }
}
