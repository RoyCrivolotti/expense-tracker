import type { GoalScenario } from '../types'
import type { NewGoalScenario } from '../data/dataSource'
import { projectNetWorth, type ProjectionParams } from './projection'

type ScenarioInput = NewGoalScenario | GoalScenario

/** Map a persisted or draft scenario to engine projection params. */
export function scenarioToParams(scenario: ScenarioInput): ProjectionParams {
  return {
    startInvestedCents: scenario.startInvestedCents,
    monthlyContributionCents: scenario.monthlyContributionCents,
    annualContributionGrowth: scenario.annualContributionGrowth,
    expectedRealReturn: scenario.expectedRealReturn,
    horizonYears: scenario.horizonYears,
    housePriceCents: scenario.housePriceCents,
    downPaymentFraction: scenario.downPaymentFraction,
    housePurchaseYear: scenario.housePurchaseYear,
    transactionCostsCents: scenario.transactionCostsCents,
    mortgageTermYears: scenario.mortgageTermYears,
    mortgageRateAnnual: scenario.mortgageRateAnnual,
    houseAppreciationRate: scenario.houseAppreciationRate,
    ...(scenario.lifeEvents?.length ? { lifeEvents: scenario.lifeEvents } : {}),
  }
}

/**
 * Compute low and high investedCents arrays for a ±spread uncertainty band.
 * `spread` is subtracted/added to `expectedRealReturn`; lo is clamped to 0.
 */
export function projectNetWorthBand(
  params: ProjectionParams,
  spread: number = 0.03,
): { lo: number[]; hi: number[] } {
  const loReturn = Math.max(0, params.expectedRealReturn - spread)
  const hiReturn = params.expectedRealReturn + spread
  const lo = projectNetWorth({ ...params, expectedRealReturn: loReturn }).map(
    (p) => p.investedCents,
  )
  const hi = projectNetWorth({ ...params, expectedRealReturn: hiReturn }).map(
    (p) => p.investedCents,
  )
  return { lo, hi }
}
