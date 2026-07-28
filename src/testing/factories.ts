/**
 * Lightweight test factories for domain types.
 * Use these in unit tests instead of building objects inline so that adding
 * new required fields to a type only requires updating the factory, not every
 * test file.
 */
import type { ExpenseDataset, GoalScenario, WealthAccount, WealthCheckin } from '../domain/types'
import { defaultExpenseSettings, defaultGoalInputs } from '../domain/engine/defaults'

/** Build a minimal valid ExpenseDataset, merging any provided overrides. */
export function makeDataset(overrides: Partial<ExpenseDataset> = {}): ExpenseDataset {
  return {
    categories: [],
    accounts: [],
    transactions: [],
    accountStatements: [],
    cashActuals: [],
    installmentPlans: [],
    goalInputs: defaultGoalInputs(),
    goalScenarios: [],
    settings: defaultExpenseSettings(),
    wealthAccounts: [],
    wealthCheckins: [],
    ...overrides,
  }
}

/** Build a minimal valid WealthAccount for tests. */
export function makeWealthAccount(overrides: Partial<WealthAccount> = {}): WealthAccount {
  return {
    id: 1,
    name: 'Broker',
    kind: 'investment',
    sortOrder: 0,
    archived: false,
    ...overrides,
  }
}

/** Build a minimal valid WealthCheckin for tests. */
export function makeWealthCheckin(overrides: Partial<WealthCheckin> = {}): WealthCheckin {
  return {
    id: 1,
    checkinDate: '2025-01-01',
    entries: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

/** Build a minimal valid GoalScenario for tests. */
export function makeScenario(overrides: Partial<GoalScenario> = {}): GoalScenario {
  return {
    id: 1,
    name: 'Scenario',
    color: '#6366f1',
    sortOrder: 0,
    startInvestedCents: 10_000_000,
    monthlyContributionCents: 100_000,
    annualContributionGrowth: 0,
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
    ...overrides,
  }
}
