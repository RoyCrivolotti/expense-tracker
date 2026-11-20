import type { GoalScenario, Milestone } from '../domain/types'
import { mulberry32 } from '../domain/engine/rng'
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

/** Inflation rates that tests of anything restated across years run at: none, falling prices, low and high. */
export const TEST_INFLATION_RATES = [-0.01, 0, 0.02, 0.05]

/**
 * Made-up plans from a seed, for tests that must hold for any plan: a start on any day of the year, a
 * horizon of 15 to 40 years, a house bought at the start, in a few years or never, one event, and a
 * change of the monthly amount in any month of the plan's first decade.
 */
export function randomPlans(seed: number, count: number): GoalScenario[] {
  const rand = mulberry32(seed)
  const pick = (n: number) => Math.floor(rand() * n)
  return Array.from({ length: count }, () => {
    const startYear = 2020 + pick(10)
    const changeMonth = 1 + pick(12)
    return samplePlan({
      id: 1,
      planStartDate: `${startYear}-${String(1 + pick(12)).padStart(2, '0')}-${String(1 + pick(28)).padStart(2, '0')}`,
      horizonYears: 15 + pick(26),
      startInvestedCents: Math.round(2_000_000 + rand() * 30_000_000),
      monthlyContributionCents: Math.round(rand() * 250_000),
      expectedRealReturn: rand() * 0.08,
      housePurchaseYear: [null, 0, 1, 3, 6, 9][pick(6)]!,
      housePriceCents: Math.round(15_000_000 + rand() * 30_000_000),
      downPaymentFraction: 0.1 + rand() * 0.4,
      mortgageTermYears: 15 + pick(16),
      mortgageRateAnnual: rand() * 0.05,
      houseAppreciationRate: 0.01 + rand() * 0.04,
      lifeEvents: [{ year: 1 + pick(14), amountCents: Math.round((rand() - 0.4) * 5_000_000), label: 'Event' }],
      contributionSchedule: [{ from: `${startYear + 1 + pick(9)}-${String(changeMonth).padStart(2, '0')}`, monthlyCents: Math.round(rand() * 300_000) }],
    })
  })
}
