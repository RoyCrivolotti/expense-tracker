/**
 * Flexible-spending pace for the month under way. Fixed costs are counted but
 * stay out of the clock (decision 9): rent on the 1st would make every month
 * look ahead of pace from day two. The flexible envelope is the total of the
 * category budgets minus the fixed charges expected this month, estimated from
 * instalment plans due and monthly recurring patterns.
 */
import type { Category, InstallmentPlan, Transaction } from '../types'
import { daysBetween } from './dates'
import { expectedIndexForMonth } from './installments'
import { classifyFrequency } from './recurringPredict'
import type { OccurrenceGroup } from './recurringTypes'
import { type AnalyticsBasis, sameDaysLimit } from './analyticsPeriod'
import { type FixedSpendClassifier, recurringFixedGroups, splitFixedFlexible } from './fixedFlexible'

export interface SpendingPace {
  /** False for a closed month: the pace clock only runs while the month is open. */
  open: boolean
  dayOfMonth: number
  daysInMonth: number
  flexibleSpentCents: number
  fixedSpentCents: number
  flexibleBudgetCents: number
  /** Where the flexible spend should sit today at an even pace. */
  shouldBeTodayCents: number
  /** Where this pace lands at month end (the spend itself once the month closes). */
  projectedCents: number
  /** Last month's flexible spend through the same day, or null without a last month. */
  lastMonthSameDayCents: number | null
}

function daysInCalendarMonth(month: string): number {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return new Date(y, m, 0).getDate()
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

function isMonthlyGroup(group: OccurrenceGroup): boolean {
  const sorted = [...group.dates].sort()
  const gaps = sorted.slice(1).map((d, i) => daysBetween(sorted[i]!, d))
  return gaps.length > 0 && classifyFrequency(median(gaps)) === 'monthly'
}

/**
 * Fixed charges expected in a budget month: instalments due plus monthly
 * recurring expenses (quarterly and annual patterns are left out — they are
 * lumpy, and guessing their month wrong would swing the envelope).
 */
export function expectedFixedCents(
  transactions: Transaction[],
  plans: InstallmentPlan[],
  month: string,
): number {
  let total = 0
  for (const plan of plans) {
    if (!plan.active || plan.type !== 'expense') continue
    const idx = expectedIndexForMonth(plan, month)
    if (idx >= plan.startInstallmentIndex && idx <= plan.totalCount) total += plan.amountCents
  }
  for (const group of recurringFixedGroups(transactions)) {
    if (group.key.type === 'expense' && isMonthlyGroup(group)) total += group.amountCents
  }
  return total
}

export interface SpendingPaceOptions {
  month: string
  today: string
  basis: AnalyticsBasis
  prevMonth: string | null
}

export function computeSpendingPace(
  transactions: Transaction[],
  categories: Category[],
  plans: InstallmentPlan[],
  classifier: FixedSpendClassifier,
  { month, today, basis, prevMonth }: SpendingPaceOptions,
): SpendingPace {
  const daysInMonth = daysInCalendarMonth(month)
  const dayLimit = sameDaysLimit(month, today)
  const open = dayLimit !== null
  const dayOfMonth = Math.min(dayLimit ?? daysInMonth, daysInMonth)

  const totalBudget = categories
    .filter((c) => c.active)
    .reduce((s, c) => s + c.monthlyBudgetCents, 0)
  const flexibleBudgetCents = Math.max(0, totalBudget - expectedFixedCents(transactions, plans, month))

  const split = splitFixedFlexible(transactions, classifier, month, basis, dayLimit)
  const frac = dayOfMonth / daysInMonth
  const projectedCents = open && frac > 0 ? Math.round(split.flexibleCents / frac) : split.flexibleCents
  const lastMonthSameDayCents = prevMonth
    ? splitFixedFlexible(transactions, classifier, prevMonth, basis, dayLimit).flexibleCents
    : null

  return {
    open,
    dayOfMonth,
    daysInMonth,
    flexibleSpentCents: split.flexibleCents,
    fixedSpentCents: split.fixedCents,
    flexibleBudgetCents,
    shouldBeTodayCents: Math.round(flexibleBudgetCents * frac),
    projectedCents,
    lastMonthSameDayCents,
  }
}
