/**
 * Goals & strategy — reproduces the workbook's live calculations: down payment
 * and mortgage from the house target, and the long-term portfolio projection
 * (FV) plus time-to-target (NPER) from current net worth and average savings.
 */
import type { GoalInputs } from '../types'
import { fv, nper, pmt } from './finance'

export interface GoalMetrics {
  downPaymentCents: number
  loanAmountCents: number
  monthlyMortgageCents: number
  avgMonthlySavingsCents: number
  liquidNetWorthCents: number
  monthsToDownPayment: number
  projectedPortfolioCents: number
  longTermTargetCents: number
  surplusCents: number
  yearsToLongTermGoal: number
}

function monthsToCover(
  targetCents: number,
  haveCents: number,
  monthlySavingsCents: number,
): number {
  if (haveCents >= targetCents) return 0
  if (monthlySavingsCents <= 0) return Infinity
  return Math.ceil((targetCents - haveCents) / monthlySavingsCents)
}

/**
 * Compute goal metrics. `avgMonthlySavingsCents` and `liquidNetWorthCents` come
 * from the monthly totals and settings respectively; everything else is derived
 * from the goal inputs.
 */
export function computeGoals(
  inputs: GoalInputs,
  avgMonthlySavingsCents: number,
  liquidNetWorthCents: number,
): GoalMetrics {
  const downPaymentCents = Math.round(inputs.housePriceCents * inputs.downPaymentFraction)
  const loanAmountCents = inputs.housePriceCents - downPaymentCents

  const monthlyRate = inputs.mortgageRateAnnual / 12
  const months = inputs.mortgageTermYears * 12
  const monthlyMortgageCents = Math.round(pmt(monthlyRate, months, loanAmountCents))

  const annualSavings = avgMonthlySavingsCents * 12
  const projectedPortfolioCents = Math.round(
    fv(inputs.expectedRealReturn, inputs.horizonYears, annualSavings, liquidNetWorthCents),
  )

  const yearsToLongTermGoal = nper(
    inputs.expectedRealReturn,
    annualSavings,
    liquidNetWorthCents,
    inputs.longTermTargetCents,
  )

  return {
    downPaymentCents,
    loanAmountCents,
    monthlyMortgageCents,
    avgMonthlySavingsCents,
    liquidNetWorthCents,
    monthsToDownPayment: monthsToCover(
      downPaymentCents,
      liquidNetWorthCents,
      avgMonthlySavingsCents,
    ),
    projectedPortfolioCents,
    longTermTargetCents: inputs.longTermTargetCents,
    surplusCents: projectedPortfolioCents - inputs.longTermTargetCents,
    yearsToLongTermGoal,
  }
}

/** Average monthly net saving across the months that have any posted activity. */
export function averageMonthlySaving(netSavingByMonth: number[]): number {
  if (netSavingByMonth.length === 0) return 0
  const total = netSavingByMonth.reduce((sum, v) => sum + v, 0)
  return Math.round(total / netSavingByMonth.length)
}
