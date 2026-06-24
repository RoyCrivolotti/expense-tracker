import type { GoalScenario } from '../types'
import type { NewGoalScenario } from '../data/dataSource'
import type { ProjectionParams } from './projection'

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
  }
}
