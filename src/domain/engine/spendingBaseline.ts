/**
 * The spending baseline: what a year really costs, measured from the trailing
 * closed months, with the run-rate after known instalments end and the active
 * Goals plan's assumed spend beside it. Read-only here — the Goals handoff is a
 * separate, explicit step.
 */
import type { GoalScenario, InstallmentPlan, Transaction } from '../types'
import { shiftBudgetMonth } from './dates'
import { finalBudgetMonth, budgetMonthForIndex } from './installments'
import { type AnalyticsBasis, spendThroughCut } from './analyticsPeriod'

export const BASELINE_MONTHS = 12

export interface SpendingBaseline {
  /** The closed budget months measured, oldest first (up to 12). */
  months: string[]
  totalCents: number
  meanMonthlyCents: number
  medianMonthlyCents: number
  /** The mean after instalment plans that end within the next 12 months fall away. */
  runRateAfterInstallmentsCents: number
  /** The active scenario's assumed monthly spend, or null without one. */
  planMonthlyCents: number | null
  /** mean − plan, or null without a plan. */
  deltaVsPlanCents: number | null
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!
}

/**
 * Per-instalment cents of active expense plans that are already running at
 * `month` (a plan that has not started yet contributed nothing to the measured
 * months, so there is nothing of it to subtract) and end within a year of it.
 */
function endingInstallmentsCents(plans: InstallmentPlan[], month: string): number {
  const horizon = shiftBudgetMonth(month, BASELINE_MONTHS)
  let total = 0
  for (const plan of plans) {
    if (!plan.active || plan.type !== 'expense') continue
    if (budgetMonthForIndex(plan, plan.startInstallmentIndex) > month) continue
    const final = finalBudgetMonth(plan)
    if (final >= month && final <= horizon) total += plan.amountCents
  }
  return total
}

export interface SpendingBaselineOptions {
  months: string[]
  /** The month being viewed; the baseline uses only closed months before it. */
  month: string
  basis: AnalyticsBasis
}

/** Null until at least one closed month has spending — there is nothing to measure. */
export function computeSpendingBaseline(
  transactions: Transaction[],
  plans: InstallmentPlan[],
  scenarios: GoalScenario[],
  { months, month, basis }: SpendingBaselineOptions,
): SpendingBaseline | null {
  const window = months.filter((m) => m < month).slice(-BASELINE_MONTHS)
  const spends = window
    .map((m) => ({ month: m, cents: spendThroughCut(transactions, m, null, basis) }))
    .filter((s) => s.cents !== 0)
  if (spends.length === 0) return null

  const totalCents = spends.reduce((s, m) => s + m.cents, 0)
  const meanMonthlyCents = Math.round(totalCents / spends.length)
  const active = scenarios.find((s) => s.isActive && s.annualSpendCents > 0)
  const planMonthlyCents = active ? Math.round(active.annualSpendCents / 12) : null
  return {
    months: spends.map((s) => s.month),
    totalCents,
    meanMonthlyCents,
    medianMonthlyCents: median(spends.map((s) => s.cents)),
    runRateAfterInstallmentsCents: Math.max(
      0,
      meanMonthlyCents - endingInstallmentsCents(plans, month),
    ),
    planMonthlyCents,
    deltaVsPlanCents: planMonthlyCents !== null ? meanMonthlyCents - planMonthlyCents : null,
  }
}
