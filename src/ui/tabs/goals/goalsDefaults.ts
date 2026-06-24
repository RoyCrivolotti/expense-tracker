import type { ExpenseDataset } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import {
  DEFAULT_ANNUAL_SPEND_CENTS,
  DEFAULT_DOWN_PAYMENT_FRACTION,
  DEFAULT_HOUSE_APPRECIATION,
  DEFAULT_HORIZON_YEARS,
  DEFAULT_MORTGAGE_RATE,
  DEFAULT_MORTGAGE_TERM_YEARS,
  DEFAULT_REAL_RETURN,
  DEFAULT_RENT_MONTHLY_CENTS,
  DEFAULT_SWR,
  DEFAULT_TRANSACTION_COSTS_CENTS,
  SCENARIO_COLORS,
} from '../../../engine'

export { duplicateScenario } from '../../../engine'

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
    horizonYears: goalInputs.horizonYears || DEFAULT_HORIZON_YEARS,
    housePriceCents: goalInputs.housePriceCents,
    downPaymentFraction: goalInputs.downPaymentFraction || DEFAULT_DOWN_PAYMENT_FRACTION,
    housePurchaseYear: null,
    transactionCostsCents: DEFAULT_TRANSACTION_COSTS_CENTS,
    mortgageTermYears: goalInputs.mortgageTermYears || DEFAULT_MORTGAGE_TERM_YEARS,
    mortgageRateAnnual: goalInputs.mortgageRateAnnual || DEFAULT_MORTGAGE_RATE,
    houseAppreciationRate: DEFAULT_HOUSE_APPRECIATION,
    rentMonthlyCents: DEFAULT_RENT_MONTHLY_CENTS,
    annualSpendCents:
      goalInputs.longTermTargetCents > 0
        ? Math.round(goalInputs.longTermTargetCents * DEFAULT_SWR)
        : DEFAULT_ANNUAL_SPEND_CENTS,
    safeWithdrawalRate: DEFAULT_SWR,
  }
}
