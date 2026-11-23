/**
 * Request bodies the seeded ledger and the tests around it send: a goal scenario, a receipt upload and an
 * expense, each with every field filled.
 */
import type { NewGoalScenario } from '../../domain/data/dataSource'
import { DEFAULT_HOME_CARRY_RATE, DEFAULT_RETIREMENT_YEARS } from '../../domain/engine/projectionConstants'

export function scenarioInput(overrides: Partial<NewGoalScenario> = {}): NewGoalScenario {
  return {
    name: 'Scenario',
    color: '#6366f1',
    sortOrder: 0,
    startInvestedCents: 10_000_000,
    monthlyContributionCents: 100_000,
    expectedRealReturn: 0.07,
    horizonYears: 30,
    housePriceCents: 400_000_000,
    downPaymentFraction: 0.2,
    housePurchaseYear: null,
    transactionCostsCents: 0,
    mortgageTermYears: 30,
    mortgageRateAnnual: 0.03,
    houseAppreciationRate: 0.025,
    rentMonthlyCents: 0,
    annualSpendCents: 0,
    safeWithdrawalRate: 0.04,
    planStartDate: null,
    lifeEvents: [],
    contributionSchedule: [],
    homeCarryRate: DEFAULT_HOME_CARRY_RATE,
    retirementYears: DEFAULT_RETIREMENT_YEARS,
    ...overrides,
  }
}

export function uploadForm(transactionId: number): FormData {
  const bytes = new Uint8Array(64)
  bytes.set([0xff, 0xd8, 0xff, 0xe0])
  const form = new FormData()
  form.set('transactionId', String(transactionId))
  form.set('file', new Blob([bytes], { type: 'image/jpeg' }), 'receipt.jpg')
  return form
}

export function expense(
  accountId: number,
  categoryId: number,
  description: string,
  day: string,
) {
  return {
    date: day,
    budgetMonth: day.slice(0, 7),
    description,
    accountId,
    categoryId,
    type: 'expense',
    amountCents: 12_300,
    cancelled: false,
  }
}
