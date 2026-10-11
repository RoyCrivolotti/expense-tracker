import type { GoalScenario, Milestone } from '../domain/types'
import { makeScenario } from './factories'

/** The yearly inflation the made-up plan assumes. */
export const SAMPLE_INFLATION = 0.02

/**
 * The one made-up plan used wherever an example is needed (docs, pull request descriptions, tests that
 * explain a behaviour): 50.000 € now, 1.000 € a month, 5% a year after inflation, started 1 January 2026
 * over 30 years, a 300.000 € house bought in year 8 (20% down, 6.000 € fees, 25-year loan at 3%, prices
 * +3% a year), 1.000 € rent, 30.000 € a year to live on at a 4% withdrawal rate. It has nothing to do
 * with anyone's real figures.
 */
export function samplePlan(overrides: Partial<GoalScenario> = {}): GoalScenario {
  return makeScenario({
    name: 'Sample plan',
    startInvestedCents: 5_000_000,
    monthlyContributionCents: 100_000,
    expectedRealReturn: 0.05,
    horizonYears: 30,
    housePriceCents: 30_000_000,
    downPaymentFraction: 0.2,
    housePurchaseYear: 8,
    transactionCostsCents: 600_000,
    mortgageTermYears: 25,
    mortgageRateAnnual: 0.03,
    houseAppreciationRate: 0.03,
    rentMonthlyCents: 100_000,
    annualSpendCents: 3_000_000,
    safeWithdrawalRate: 0.04,
    planStartDate: '2026-01-01',
    isActive: true,
    ...overrides,
  })
}

/** 100k, 250k, 500k and 1M, as amounts on the account. */
export const SAMPLE_MILESTONES: Milestone[] = [10_000_000, 25_000_000, 50_000_000, 100_000_000].map(
  (amountCents) => ({ amountCents, label: '' }),
)
