/**
 * Lightweight test factories for domain types.
 * Use these in unit tests instead of building objects inline so that adding
 * new required fields to a type only requires updating the factory, not every
 * test file.
 */
import type {
  ExpenseDataset,
  Flag,
  GoalScenario,
  Transaction,
  TransactionAttachment,
  WealthAccount,
  WealthCheckin,
} from '../domain/types'
import { defaultExpenseSettings, defaultGoalInputs } from '../domain/engine/defaults'
import type { Lookup } from '../ui/format'

/** Build a minimal valid ExpenseDataset, merging any provided overrides. */
export function makeDataset(overrides: Partial<ExpenseDataset> = {}): ExpenseDataset {
  return {
    categories: [],
    accounts: [],
    flags: [],
    attachments: [],
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

/** Build a minimal valid Transaction (a StoredTransaction plus derived status). */
export function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 1,
    date: '2025-01-15',
    budgetMonth: '2025-01',
    description: 'Flight BCN-LIS',
    accountId: 1,
    categoryId: 1,
    type: 'expense',
    amountCents: 19_840,
    cancelled: false,
    status: 'posted',
    ...overrides,
  }
}

/** Build a minimal valid TransactionAttachment for tests. */
export function makeAttachment(
  overrides: Partial<TransactionAttachment> = {},
): TransactionAttachment {
  return {
    id: 1,
    transactionId: 1,
    contentType: 'image/jpeg',
    byteSize: 120_000,
    createdAt: '2026-05-01T09:00:00Z',
    hasThumb: true,
    ...overrides,
  }
}

/** Build a minimal valid Flag for tests. */
export function makeFlag(overrides: Partial<Flag> = {}): Flag {
  return {
    id: 1,
    name: 'Work travel',
    color: '#6366f1',
    reimbursable: true,
    sortOrder: 0,
    active: true,
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
    lifeEvents: [],
    ...overrides,
  }
}

/**
 * A `Lookup` of empty answers, for tests that render something needing one but
 * do not care what it returns.
 *
 * Exists for the same reason `makeActions` does: eight test files hand-rolled
 * this object, so every field added to `Lookup` broke all eight at once and the
 * fix was eight identical edits.
 */
export function makeLookup(overrides: Partial<Lookup> = {}): Lookup {
  return {
    category: () => undefined,
    account: () => undefined,
    flag: () => undefined,
    attachments: () => [],
    categoryName: () => '',
    accountName: () => '',
    installmentPlan: () => undefined,
    settlementFor: () => undefined,
    settledBy: () => [],
    ...overrides,
  }
}
