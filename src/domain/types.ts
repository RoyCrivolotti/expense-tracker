/**
 * Domain types for the expense tracker. These mirror the normalized D1 schema
 * (see migrations/) but are framed for the in-browser compute engine: money is
 * always integer cents, dates are ISO strings, and budget months are YYYY-MM.
 */

export type TxnType = 'expense' | 'income' | 'investment' | 'refund'
export type TxnStatus = 'posted' | 'forecast' | 'cancelled'
export type AccountKind = 'debit' | 'credit'

/**
 * How an account settles. `immediate` accounts (debit) move cash the moment a
 * transaction is entered, so their rows are always posted. `deferred` accounts
 * (credit/charge cards) only move cash once the budget month's statement is
 * marked paid; until then their rows are forecast.
 */
export type AccountSettlement = 'immediate' | 'deferred'

export interface Category {
  id: number
  name: string
  monthlyBudgetCents: number
  sortOrder: number
  icon?: string
  color?: string
  active: boolean
}

export interface Account {
  id: number
  name: string
  kind: AccountKind
  settlement: AccountSettlement
  active: boolean
}

/**
 * A stored transaction. `status` is NOT stored — only `cancelled` is. The
 * effective status is derived from the account's settlement and the matching
 * statement's paid flag (see engine/status.ts).
 */
export interface StoredTransaction {
  id: number
  /** ISO 8601 calendar date, YYYY-MM-DD. */
  date: string
  /** Budget period the transaction is charged against, YYYY-MM. */
  budgetMonth: string
  description: string
  accountId: number
  categoryId: number
  type: TxnType
  /** Always positive; the type decides how it affects totals. */
  amountCents: number
  cancelled: boolean
  notes?: string
}

/** A transaction with its derived status, as consumed by the compute engine. */
export interface Transaction extends StoredTransaction {
  status: TxnStatus
}

/**
 * Whether a deferred account's statement for a given budget month has been paid.
 * Replaces the workbook's hardcoded "Iberia Paid?" / "SC Paid?" columns with a
 * generalized per-account record.
 */
export interface AccountStatement {
  accountId: number
  yearMonth: string
  paid: boolean
  /** ISO date the statement was paid, when known. */
  paidOn?: string
}

/** Goal inputs, all in plain units (euros, percent as fraction, years). */
export interface GoalInputs {
  housePriceCents: number
  downPaymentFraction: number
  mortgageTermYears: number
  mortgageRateAnnual: number
  longTermTargetCents: number
  horizonYears: number
  expectedRealReturn: number
}

/**
 * A saved comparison scenario for the Goals projection view.
 * Money in integer cents; rates as fractions.
 */
export interface GoalScenario {
  id: number
  name: string
  color: string
  sortOrder: number
  startInvestedCents: number
  monthlyContributionCents: number
  annualContributionGrowth: number
  expectedRealReturn: number
  horizonYears: number
  housePriceCents: number
  downPaymentFraction: number
  /** null = never buy; 0 = owned from day one. */
  housePurchaseYear: number | null
  transactionCostsCents: number
  mortgageTermYears: number
  mortgageRateAnnual: number
  houseAppreciationRate: number
  rentMonthlyCents: number
  annualSpendCents: number
  safeWithdrawalRate: number
}

/** Opening balances and other scalar settings used by running-balance views. */
export interface ExpenseSettings {
  openingCashCents: number
  openingInvestmentCents: number
  liquidNetWorthCents: number
  /** Pre-selected account when creating a new transaction; null = first active account. */
  defaultAccountId: number | null
}

/**
 * The real bank-cash balance recorded for a budget month, entered manually after
 * the cards are paid (~12th–15th). The reconciliation Gap is this minus the
 * engine's expected cash, surfacing un-entered or mistaken transactions.
 */
export interface CashActual {
  yearMonth: string
  actualCashCents: number
}

/** A fully denormalized dataset, as produced by the CSV importer or the API. */
export interface ExpenseDataset {
  categories: Category[]
  accounts: Account[]
  /** Transactions with derived status already applied. */
  transactions: Transaction[]
  accountStatements: AccountStatement[]
  cashActuals: CashActual[]
  goalInputs: GoalInputs
  goalScenarios: GoalScenario[]
  settings: ExpenseSettings
}
