import type { NewGoalScenario } from '../data/dataSource'
import {
  DEFAULT_HOUSE_APPRECIATION,
  DEFAULT_MORTGAGE_RATE,
  DEFAULT_MORTGAGE_TERM_YEARS,
  DEFAULT_REAL_RETURN,
  DEFAULT_RENT_MONTHLY_CENTS,
  DOWN_PAYMENT_FRACTION,
  DEFAULT_HOUSE_PRICE_CENTS,
  REMOVED_PATH_PRESETS,
  SCENARIO_COLORS,
  TRANSACTION_COSTS_CENTS,
} from './projectionConstants'

const colorAt = (index: number): string =>
  SCENARIO_COLORS[index % SCENARIO_COLORS.length] ?? '#6366f1'

export function pathScenarioPreset(
  path: keyof typeof REMOVED_PATH_PRESETS,
  sortOrder: number,
): NewGoalScenario {
  const preset = REMOVED_PATH_PRESETS[path]
  return {
    name: preset.name,
    color: colorAt(sortOrder),
    sortOrder,
    startInvestedCents: preset.startInvestedCents,
    monthlyContributionCents: Math.round(600_000 / 12),
    annualContributionGrowth: 0,
    expectedRealReturn: DEFAULT_REAL_RETURN,
    horizonYears: 30,
    housePriceCents: DEFAULT_HOUSE_PRICE_CENTS,
    downPaymentFraction: DOWN_PAYMENT_FRACTION,
    housePurchaseYear: preset.housePurchaseYear,
    transactionCostsCents: TRANSACTION_COSTS_CENTS,
    mortgageTermYears: DEFAULT_MORTGAGE_TERM_YEARS,
    mortgageRateAnnual: DEFAULT_MORTGAGE_RATE,
    houseAppreciationRate: DEFAULT_HOUSE_APPRECIATION,
    rentMonthlyCents: DEFAULT_RENT_MONTHLY_CENTS,
    annualSpendCents: 4_000_000,
    safeWithdrawalRate: 0.04,
  }
}

export function duplicateScenario(
  scenario: NewGoalScenario,
  sortOrder: number,
): NewGoalScenario {
  return {
    ...scenario,
    name: `${scenario.name} (copy)`,
    sortOrder,
    color: colorAt(sortOrder),
  }
}
