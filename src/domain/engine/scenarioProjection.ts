import type { GoalScenario } from '../types'
import type { NewGoalScenario } from '../data/dataSource'
import { scheduleSteps } from './contributionSchedule'
import { projectNetWorth, type ProjectionParams } from './projection'

type ScenarioInput = NewGoalScenario | GoalScenario

/**
 * Map a persisted or draft scenario to engine projection params. The inflation is the
 * owner's, not the scenario's, so it is given and never defaulted.
 */
export function scenarioToParams(scenario: ScenarioInput, inflationRate: number): ProjectionParams {
  // Absent on a scenario from before the field, which a cached snapshot can still hold.
  const steps = scheduleSteps(scenario.planStartDate, scenario.contributionSchedule)
  return {
    startInvestedCents: scenario.startInvestedCents,
    monthlyContributionCents: scenario.monthlyContributionCents,
    expectedRealReturn: scenario.expectedRealReturn,
    horizonYears: scenario.horizonYears,
    housePriceCents: scenario.housePriceCents,
    downPaymentFraction: scenario.downPaymentFraction,
    housePurchaseYear: scenario.housePurchaseYear,
    transactionCostsCents: scenario.transactionCostsCents,
    mortgageTermYears: scenario.mortgageTermYears,
    mortgageRateAnnual: scenario.mortgageRateAnnual,
    houseAppreciationRate: scenario.houseAppreciationRate,
    inflationRate,
    ...(scenario.lifeEvents?.length ? { lifeEvents: scenario.lifeEvents } : {}),
    ...(steps.length ? { contributionSteps: steps } : {}),
  }
}

/**
 * How far either side of the real return the band is drawn: three points. It shows how much the
 * return matters, not how likely an outcome is. The chart says so in words, so it reads this
 * rather than carrying a copy of the number.
 */
export const RETURN_BAND_SPREAD = 0.03

/**
 * Compute low and high investedCents arrays for a ±spread return band, and what each edge reached
 * just before a house payment or event (`loPre`, `hiPre`, the same as the edge where there is none).
 * `spread` is subtracted/added to `expectedRealReturn`; lo is clamped to 0.
 */
export function projectNetWorthBand(
  params: ProjectionParams,
  spread: number = RETURN_BAND_SPREAD,
): { lo: number[]; hi: number[]; loPre: number[]; hiPre: number[] } {
  const loReturn = Math.max(0, params.expectedRealReturn - spread)
  const hiReturn = params.expectedRealReturn + spread
  const lo = projectNetWorth({ ...params, expectedRealReturn: loReturn })
  const hi = projectNetWorth({ ...params, expectedRealReturn: hiReturn })
  // The edges step where the line does, so the line stays inside the band through a purchase.
  return {
    lo: lo.map((p) => p.investedCents),
    hi: hi.map((p) => p.investedCents),
    loPre: lo.map((p) => p.preEventInvestedCents),
    hiPre: hi.map((p) => p.preEventInvestedCents),
  }
}
