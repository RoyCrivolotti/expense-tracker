/**
 * What changed: flexible spend per category against the mean of the three closed
 * months before, cut at the same days when the month is open. Fixed charges are
 * excluded — rent moving 0% is not news.
 */
import type { Category, Transaction } from '../types'
import { type AnalyticsBasis, basisOptions, sameDaysLimit, signedExpense } from './analyticsPeriod'
import type { FixedSpendClassifier } from './fixedFlexible'

export interface Mover {
  categoryId: number
  name: string
  currentCents: number
  baselineCents: number
  deltaCents: number
}

function flexibleByCategory(
  transactions: Transaction[],
  classifier: FixedSpendClassifier,
  month: string,
  dayLimit: number | null,
  basis: AnalyticsBasis,
): Map<number, number> {
  const opts = basisOptions(basis)
  const byCategory = new Map<number, number>()
  for (const txn of transactions) {
    if (txn.budgetMonth !== month) continue
    if (dayLimit !== null && parseInt(txn.date.slice(8, 10), 10) > dayLimit) continue
    if (classifier.isFixed(txn)) continue
    const signed = signedExpense(txn, opts)
    if (signed === null) continue
    byCategory.set(txn.categoryId, (byCategory.get(txn.categoryId) ?? 0) + signed)
  }
  return byCategory
}

export interface MoversOptions {
  months: string[]
  month: string
  basis: AnalyticsBasis
  today: string
  /** The budget month `today` falls in (rollover-aware); defaults to today's calendar month. */
  openMonth?: string
  limit?: number
}

export function computeMovers(
  transactions: Transaction[],
  categories: Category[],
  classifier: FixedSpendClassifier,
  { months, month, basis, today, openMonth, limit = 5 }: MoversOptions,
): Mover[] {
  const dayLimit = sameDaysLimit(month, today, openMonth)
  const current = flexibleByCategory(transactions, classifier, month, dayLimit, basis)
  const window = months.filter((m) => m < month).slice(-3)
  const sums = window.map((m) => flexibleByCategory(transactions, classifier, m, dayLimit, basis))

  const movers: Mover[] = []
  for (const cat of categories) {
    const currentCents = current.get(cat.id) ?? 0
    const baselineCents =
      window.length === 0
        ? 0
        : Math.round(sums.reduce((s, m) => s + (m.get(cat.id) ?? 0), 0) / window.length)
    if (currentCents === 0 && baselineCents === 0) continue
    movers.push({
      categoryId: cat.id,
      name: cat.name,
      currentCents,
      baselineCents,
      deltaCents: currentCents - baselineCents,
    })
  }
  return movers.sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents)).slice(0, limit)
}
