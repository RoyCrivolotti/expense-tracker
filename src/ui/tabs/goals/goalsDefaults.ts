import type { ExpenseDataset } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import {
  DEFAULT_HOUSE_APPRECIATION,
  DEFAULT_MORTGAGE_RATE,
  DEFAULT_MORTGAGE_TERM_YEARS,
  DEFAULT_REAL_RETURN,
  DEFAULT_RENT_MONTHLY_CENTS,
  DOWN_PAYMENT_FRACTION,
  DEFAULT_HOUSE_PRICE_CENTS,
  SCENARIO_COLORS,
  TRANSACTION_COSTS_CENTS,
} from '../../../engine'

export { duplicateScenario, pathScenarioPreset } from '../../../engine'

export function draftFromDataset(
  dataset: ExpenseDataset,
  avgMonthlySavingCents: number,
): NewGoalScenario {
  const { goalInputs, settings } = dataset
  return {
    name: 'Current plan',
    color: SCENARIO_COLORS[0] ?? '#6366f1',
    sortOrder: 0,
    startInvestedCents: settings.liquidNetWorthCents,
    monthlyContributionCents: avgMonthlySavingCents,
    annualContributionGrowth: 0,
    expectedRealReturn: goalInputs.expectedRealReturn || DEFAULT_REAL_RETURN,
    horizonYears: goalInputs.horizonYears || 30,
    housePriceCents: goalInputs.housePriceCents || DEFAULT_HOUSE_PRICE_CENTS,
    downPaymentFraction: goalInputs.downPaymentFraction || DOWN_PAYMENT_FRACTION,
    housePurchaseYear: null,
    transactionCostsCents: TRANSACTION_COSTS_CENTS,
    mortgageTermYears: goalInputs.mortgageTermYears || DEFAULT_MORTGAGE_TERM_YEARS,
    mortgageRateAnnual: goalInputs.mortgageRateAnnual || DEFAULT_MORTGAGE_RATE,
    houseAppreciationRate: DEFAULT_HOUSE_APPRECIATION,
    rentMonthlyCents: DEFAULT_RENT_MONTHLY_CENTS,
    annualSpendCents:
      goalInputs.longTermTargetCents > 0
        ? Math.round(goalInputs.longTermTargetCents * 0.04)
        : 4_000_000,
    safeWithdrawalRate: 0.04,
  }
}
