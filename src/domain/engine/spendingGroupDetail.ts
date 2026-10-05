/**
 * The detail behind a Spending row: its monthly history against the budget, a
 * few summary statistics, and the biggest transactions of the selected month —
 * the path from a number to the ledger behind it.
 */
import type { Category, Transaction } from '../types'
import { type AnalyticsBasis, basisOptions, sameDaysLimit, signedExpense } from './analyticsPeriod'
import { classifyFixedSpend } from './fixedFlexible'
import { groupMatcher, type SpendingGroupBy } from './spendingGroups'

export interface SpendingGroupDetail {
  /** Net expense per trailing month, oldest first, with the budget beside it. */
  history: { month: string; actualCents: number; budgetCents: number | null }[]
  meanCents: number
  medianCents: number
  worst: { month: string; cents: number } | null
  /** Months whose spend exceeded the budget (category mode only). */
  monthsOver: number
  /** The selected month's biggest expenses, largest first. */
  topTransactions: Transaction[]
}

export interface SpendingGroupDetailOptions {
  months: string[]
  month: string
  basis: AnalyticsBasis
  groupBy: SpendingGroupBy
  key: string
  topCount?: number
  /** ISO date; with `openMonth` it clamps the open month to the same days the row total uses. */
  today?: string
  /** The budget month `today` falls in (rollover-aware); defaults to today's calendar month. */
  openMonth?: string
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!
}

interface Collected {
  byMonth: Map<string, number>
  current: Transaction[]
}

function collect(
  transactions: Transaction[],
  matches: (txn: Transaction) => boolean,
  window: string[],
  month: string,
  basis: AnalyticsBasis,
  dayLimit: number | null,
): Collected {
  const opts = basisOptions(basis)
  const inWindow = new Set(window)
  const byMonth = new Map<string, number>()
  const current: Transaction[] = []
  for (const txn of transactions) {
    if (!inWindow.has(txn.budgetMonth) || !matches(txn)) continue
    const signed = signedExpense(txn, opts)
    if (signed === null) continue
    // The selected open month is clamped to the same days as the row total,
    // so the pane and the row never show two different numbers for one month.
    if (txn.budgetMonth === month && dayLimit !== null && parseInt(txn.date.slice(8, 10), 10) > dayLimit)
      continue
    byMonth.set(txn.budgetMonth, (byMonth.get(txn.budgetMonth) ?? 0) + signed)
    if (txn.budgetMonth === month && txn.type === 'expense') current.push(txn)
  }
  return { byMonth, current }
}

function worstOf(history: { month: string; actualCents: number }[]): { month: string; cents: number } | null {
  let worst: { month: string; cents: number } | null = null
  for (const h of history) {
    if (worst === null || h.actualCents > worst.cents) worst = { month: h.month, cents: h.actualCents }
  }
  return worst && worst.cents > 0 ? worst : null
}

export function computeSpendingGroupDetail(
  args: { transactions: Transaction[]; categories: Category[] },
  { months, month, basis, groupBy, key, topCount = 5, today, openMonth }: SpendingGroupDetailOptions,
): SpendingGroupDetail {
  const classifier = classifyFixedSpend(args.transactions)
  const window = months.filter((m) => m <= month).slice(-12)
  const dayLimit = today === undefined ? null : sameDaysLimit(month, today, openMonth)
  const { byMonth, current } = collect(
    args.transactions,
    groupMatcher(groupBy, key, classifier),
    window,
    month,
    basis,
    dayLimit,
  )

  const budgetCents =
    groupBy === 'category'
      ? (args.categories.find((c) => String(c.id) === key)?.monthlyBudgetCents ?? 0) || null
      : null
  const history = window.map((m) => ({ month: m, actualCents: byMonth.get(m) ?? 0, budgetCents }))
  const values = history.map((h) => h.actualCents)
  return {
    history,
    meanCents: values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : 0,
    medianCents: values.length ? median(values) : 0,
    worst: worstOf(history),
    monthsOver: budgetCents ? history.filter((h) => h.actualCents > budgetCents).length : 0,
    topTransactions: current.sort((a, b) => b.amountCents - a.amountCents).slice(0, topCount),
  }
}
