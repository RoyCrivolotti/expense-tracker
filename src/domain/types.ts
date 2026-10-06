/**
 * Domain types for the expense tracker. These mirror the normalized D1 schema
 * (see migrations/) but are framed for the in-browser compute engine: money is
 * always integer cents, dates are ISO strings, and budget months are YYYY-MM.
 */

import type { LeverKey } from './engine/goalLevers'

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
 * A reusable marker a user applies to transactions to track something that
 * outlives a budget month — "Work travel — reimburse", "Tax deductible". A
 * category says what the money was for; a flag says what still has to happen
 * about it. Setting `active: false` archives a flag: it drops out of the
 * pickers and the Flagged summary but keeps its existing links, so a settled
 * claim stays readable in history.
 */
export interface Flag {
  id: number
  name: string
  /** Hex, `#rrggbb`. Presets come from SCENARIO_COLORS; custom values allowed. */
  color: string
  /** Optional note explaining what the flag is for, shown under its name. */
  description?: string
  /**
   * Whether somebody owes this money back.
   *
   * "Work travel" is repaid by an employer; "Tax deductible" is a note to self
   * that nobody is going to pay. Only a reimbursable flag offers an expense
   * report and a Record reimbursement action — on the others they produce a
   * document addressed to nobody, for money that is not coming.
   */
  reimbursable: boolean
  sortOrder: number
  active: boolean
  /**
   * A label applied automatically to every transaction this flag is set on,
   * both retroactively when configured and going forward. Lets a flag that
   * clears on reimbursement hand off to a label that never does, without
   * tagging every claimed row by hand. Absent means no auto-label.
   */
  autoLabelId?: number
}

/**
 * A persistent, multi-value tag a user applies to transactions to record what
 * they belong to — a trip, a project — regardless of any flag's lifecycle. A
 * flag says "this still needs something done about it" and clears once that
 * happens (see `Flag`); a label says "this belongs to X" and is never cleared
 * by anything the app does on its own, only by hand. A transaction can carry
 * any number of labels, unlike a flag's one-at-a-time link. Setting
 * `active: false` archives a label: it drops out of the pickers but keeps its
 * existing links.
 */
export interface Label {
  id: number
  name: string
  /** Hex, `#rrggbb`. Presets come from SCENARIO_COLORS; custom values allowed. */
  color: string
  /** Optional note explaining what the label is for. */
  description?: string
  sortOrder: number
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
  /**
   * Positive; the type decides how it affects totals. The one exception is an
   * `investment`, which may be negative: money taken back out of the portfolio (a sale to
   * cash, a dividend paid out), which nets against the month's investing and counts as an
   * outflow in the measured portfolio return.
   */
  amountCents: number
  cancelled: boolean
  notes?: string
  /** ISO datetime when the row was first saved (D1 only; absent in CSV import). */
  createdAt?: string
  /** Installment plan this row settles, when it is one plan's monthly payment. */
  planId?: number
  /** Which payment in the plan schedule this row is (1-based), when plan-linked. */
  installmentIndex?: number
  /** Flag applied to this row, when any. At most one (see migrations/0015). */
  flagId?: number
  /**
   * The `refund` transaction that reimbursed this row, when one has. Set by
   * recording a reimbursement, cleared if that reimbursement is deleted.
   *
   * A settled row also has its `flagId` cleared in the same patch (see
   * recordReimbursement.ts) — a flag means "needs attention", and being paid
   * back is how that resolves. A row settled before that shipped keeps
   * whatever flag it already had, untouched.
   */
  settledBy?: number
  /**
   * On a reimbursement payment only: how many rows it covered, and what they came
   * to, at the moment it was recorded.
   *
   * A past report is otherwise rebuilt from whatever still points at the payment,
   * so editing a covered row afterwards rewrites the record of what was submitted.
   * These are the fixed point that record is read from, and the live rows are
   * checked against. Absent on payments recorded before migration 0021, which is
   * why a report can honestly say it cannot be checked.
   */
  reportCount?: number
  reportCoveredCents?: number
}

/** A transaction with its derived status, as consumed by the compute engine. */
export interface Transaction extends StoredTransaction {
  status: TxnStatus
  /**
   * Labels this transaction carries, joined in from `transaction_labels` —
   * never a real column, so it lives here rather than on `StoredTransaction`,
   * the same reason `status` does not live there either. Optional rather than
   * always-present: a handful of ids belonging to another relation is not
   * worth forcing on every test fixture and hand-built transaction literal in
   * the app the way `flagId`/`settledBy` already are not. Real data (`loadDataset`,
   * the write paths) always resolves it to a concrete array, `[]` when a
   * transaction has none — treat an absent key the same as `[]`, never as
   * "unknown".
   */
  labelIds?: number[]
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

/**
 * A purchase split into a fixed number of equal monthly payments (e.g. a phone
 * financed over 24 months). Unlike recurring detection, a plan is a declared,
 * bounded commitment. `anchorBudgetMonth` is the budget month in which
 * `startInstallmentIndex` falls due, which anchors the whole schedule; every
 * other installment's budget month is derived by offset.
 */
export interface InstallmentPlan {
  id: number
  description: string
  /** Total number of installments in the plan (e.g. 24). */
  totalCount: number
  /** Per-installment amount, always positive, integer cents. */
  amountCents: number
  accountId: number
  categoryId: number
  type: TxnType
  /** YYYY-MM budget month for the `startInstallmentIndex` payment. */
  anchorBudgetMonth: string
  /** First installment number tracked here (1 for fresh plans). */
  startInstallmentIndex: number
  /** Day of month (1-31) the payment is due; undefined for legacy/unknown. */
  dueDayOfMonth?: number
  active: boolean
}

export type WealthAccountKind = 'investment' | 'cash' | 'other_asset' | 'debt'

/** A named wealth component tracked by market value (e.g. "Broker", "Wise savings"). */
export interface WealthAccount {
  id: number
  name: string
  kind: WealthAccountKind
  sortOrder: number
  archived: boolean
}

/** A per-account market-value entry within a check-in. */
export interface WealthCheckinEntry {
  accountId: number
  valueCents: number
}

/**
 * A point-in-time snapshot of wealth across named accounts.
 * `entries` is always present and ordered by account sort_order.
 */
export interface WealthCheckin {
  id: number
  checkinDate: string
  note?: string
  createdAt: string
  entries: WealthCheckinEntry[]
}

/**
 * A saved comparison scenario for the Goals projection view.
 * Money in integer cents; rates as fractions.
 */
export interface LifeEvent {
  /** Year offset from projection start (0 = year 0, 1 = year 1, …). */
  year: number
  /** Net cash impact on the invested portfolio (positive = inflow, negative = outflow). */
  amountCents: number
  /** Short description, e.g. "Inheritance", "Car purchase". */
  label: string
}

/**
 * A change to what the scenario invests each month: from the first of `from`, the monthly amount
 * is `monthlyCents`. Before it the scenario is exactly as it was. Dated, not keyed by projection
 * year like a life event, so it keeps its place when the plan start moves.
 */
export interface ContributionStep {
  /** The month the new amount starts in, `YYYY-MM`. */
  from: string
  /** The monthly amount from then on, in today's money like the base (0 is a pause). */
  monthlyCents: number
}

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
  /**
   * ISO date (YYYY-MM-DD) when this scenario's projection starts.
   * Used to compute plan-vs-actual deltas at any calendar date.
   * null for legacy scenarios that pre-date the migration.
   */
  planStartDate: string | null
  /** One-off cash events applied to the invested portfolio in the projection. */
  lifeEvents: LifeEvent[]
  /**
   * Changes to the monthly amount from a date on, in date order. Needs `planStartDate` to
   * mean anything: without one there is no date for a plan year to start on, so none is applied.
   */
  contributionSchedule: ContributionStep[]
  /**
   * The owner's plan: the one scenario that Progress, the dashboard and check-in
   * deltas measure against. At most one per owner; set through activation, never
   * through a create or patch, so the editor's selection and the plan stay separate.
   */
  isActive: boolean
}

/**
 * A net-worth target the owner tracks progress against, measured on the
 * invested portfolio only (matching the years-to-milestone matrix).
 */
export interface Milestone {
  /** Target value in integer cents. */
  amountCents: number
  /** Short optional name, e.g. "House deposit". Empty renders as the amount. */
  label: string
  /** Optional YYYY-MM-DD by which the amount should be reached; lets Progress say on track or late. */
  targetDate?: string
}

/** Opening balances and other scalar settings used by running-balance views. */
export interface ExpenseSettings {
  openingCashCents: number
  openingInvestmentCents: number
  /** Pre-selected account when creating a new transaction; null = first active account. */
  defaultAccountId: number | null
  /**
   * The category every investment row is filed under, whichever way the money moves;
   * the form locks it. Null falls back to a category named for investments, if any.
   */
  investmentCategoryId: number | null
  /** ISO 4217 code driving the currency symbol, e.g. 'EUR', 'USD'. */
  currencyCode: string
  /** BCP-47 locale driving digit grouping and decimal separator, e.g. 'de-DE', 'en-US'. */
  numberLocale: string
  /**
   * Name printed on a reimbursement claim. Empty means "not set" — the claim
   * sheet then omits the claimant line rather than printing a blank one.
   */
  claimantName: string
  /**
   * Day of month (1-31) on/after which a transaction rolls into the next budget
   * month. 1 = plain calendar months (budget month equals calendar month).
   */
  budgetRolloverDay: number
  /**
   * Net-worth milestones, ascending by amount. Resolved from the built-in
   * defaults when the owner has never customised them; an empty array is a
   * deliberate "no milestones" choice, not a missing value.
   */
  milestones: Milestone[]
  /**
   * Months of spending to hold in cash accounts, the emergency-fund target Progress
   * measures the cash balance against. Zero means no target.
   */
  cashReserveMonths: number
  /**
   * The yearly inflation the Goals tab assumes (0.02 = 2%): check-in balances are brought back
   * to today's money by it before they meet the plan, as are the house and the mortgage, and
   * the nominal view inflates the plan by it. One value for the owner, not per plan.
   */
  assumedInflation: number
  /**
   * The scenario inputs the Goals page keeps in its bar, in the order they are shown: at most
   * five, resolved to the built-in defaults when the owner has never chosen. An empty list is a
   * deliberate choice, not a missing value.
   */
  goalLevers: LeverKey[]
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
/**
 * A receipt pinned to a transaction. Metadata only — the bytes live in R2 and
 * are fetched by URL (`/api/expenses/attachments/:id`), never carried in the
 * dataset: `datasetPatches.cloneDataset` structuredClones the whole dataset on
 * every mutation, and `offlineCache` writes it to IndexedDB.
 */
export interface TransactionAttachment {
  id: number
  transactionId: number
  /** Sniffed server-side from the bytes, never the client's declared type. */
  contentType: string
  byteSize: number
  width?: number
  height?: number
  /** Shown in the viewer and used for the download filename. */
  originalName?: string
  createdAt: string
  /** Whether a downscaled preview exists; PDFs have none. */
  hasThumb: boolean
}

export interface ExpenseDataset {
  categories: Category[]
  accounts: Account[]
  flags: Flag[]
  labels: Label[]
  attachments: TransactionAttachment[]
  /** Transactions with derived status already applied. */
  transactions: Transaction[]
  accountStatements: AccountStatement[]
  cashActuals: CashActual[]
  installmentPlans: InstallmentPlan[]
  goalScenarios: GoalScenario[]
  settings: ExpenseSettings
  wealthAccounts: WealthAccount[]
  wealthCheckins: WealthCheckin[]
}
