/**
 * Flexible-spending pace for the month under way. Fixed costs are counted but
 * stay out of the clock (decision 9): rent on the 1st would make every month
 * look ahead of pace from day two. The flexible envelope is the total of the
 * category budgets minus the fixed charges expected this month, estimated from
 * instalment plans due and monthly recurring patterns.
 */
import type { Category, InstallmentPlan, Transaction } from '../types'
import { daysBetween, priorBudgetMonth } from './dates'
import { expectedIndexForMonth } from './installments'
import { classifyFrequency } from './recurringPredict'
import type { OccurrenceGroup } from './recurringTypes'
import { type AnalyticsBasis, budgetMonthLength, sameDaysCut } from './analyticsPeriod'
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

/** A recurring pattern counts towards a month's fixed charges only while it is alive. */
function activeInMonth(group: OccurrenceGroup, month: string): boolean {
  const prior = priorBudgetMonth(month)
  return (
    group.budgetMonths.has(month) ||
    group.budgetMonths.has(prior) ||
    group.budgetMonths.has(priorBudgetMonth(prior))
  )
}

/** The categories whose budgets make up the envelope: active, with a budget set. */
function budgetedCategoryIds(categories: Category[]): Set<number> {
  return new Set(categories.filter((c) => c.active && c.monthlyBudgetCents > 0).map((c) => c.id))
}

/**
 * Fixed charges expected in a budget month: instalments due plus monthly
 * recurring expenses seen in that month or the two before it — a cancelled
 * subscription must not shrink the flexible envelope forever. Quarterly and
 * annual patterns are left out: they are lumpy, and guessing their month wrong
 * would swing the envelope. A charge in a category with no active budget never
 * added to the envelope, so it must not take anything out of it either.
 */
export function expectedFixedCents(
  transactions: Transaction[],
  plans: InstallmentPlan[],
  categories: Category[],
  month: string,
): number {
  const budgeted = budgetedCategoryIds(categories)
  let total = 0
  for (const plan of plans) {
    if (!plan.active || plan.type !== 'expense' || !budgeted.has(plan.categoryId)) continue
    const idx = expectedIndexForMonth(plan, month)
    if (idx >= plan.startInstallmentIndex && idx <= plan.totalCount) total += plan.amountCents
  }
  for (const group of recurringFixedGroups(transactions)) {
    if (group.key.type !== 'expense' || !budgeted.has(group.categoryId) || !isMonthlyGroup(group)) continue
    if (activeInMonth(group, month)) total += group.amountCents
  }
  return total
}

export interface SpendingPaceOptions {
  month: string
  today: string
  basis: AnalyticsBasis
  prevMonth: string | null
  /** The budget month `today` falls in (rollover-aware); defaults to today's calendar month. */
  openMonth?: string
  /** The owner's budget rollover day; defaults to plain calendar months. */
  rolloverDay?: number
}

export function computeSpendingPace(
  transactions: Transaction[],
  categories: Category[],
  plans: InstallmentPlan[],
  classifier: FixedSpendClassifier,
  { month, today, basis, prevMonth, openMonth, rolloverDay }: SpendingPaceOptions,
): SpendingPace {
  const daysInMonth = budgetMonthLength(month, rolloverDay)
  const cut = sameDaysCut(month, today, openMonth, rolloverDay)
  const open = cut !== null
  const dayOfMonth = cut?.elapsedDays ?? daysInMonth

  const totalBudget = categories
    .filter((c) => c.active)
    .reduce((s, c) => s + c.monthlyBudgetCents, 0)
  const flexibleBudgetCents = Math.max(0, totalBudget - expectedFixedCents(transactions, plans, categories, month))

  // The clock measures the spend the envelope was built from: spend in a category with
  // no active budget is neither in the envelope nor in the pace.
  const budgeted = budgetedCategoryIds(categories)
  const inEnvelope = transactions.filter((t) => budgeted.has(t.categoryId))
  const split = splitFixedFlexible(inEnvelope, classifier, month, basis, cut)
  const frac = dayOfMonth / daysInMonth
  const projectedCents = open && frac > 0 ? Math.round(split.flexibleCents / frac) : split.flexibleCents
  const lastMonthSameDayCents = prevMonth
    ? splitFixedFlexible(inEnvelope, classifier, prevMonth, basis, cut).flexibleCents
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
