/**
 * Data source abstraction. The UI talks to this interface, not to a specific
 * backend, so Phase 1 (bundled CSV, read-only) and Phase 2 (live D1 API) are
 * swappable without touching the views.
 */
import type {
  Account,
  AccountStatement,
  CashActual,
  Category,
  ExpenseDataset,
  ExpenseSettings,
  Flag,
  GoalInputs,
  GoalScenario,
  InstallmentPlan,
  StoredTransaction,
  Transaction,
  WealthAccount,
  WealthCheckin,
  WealthCheckinEntry,
} from '../types'

export type NewTransaction = Omit<StoredTransaction, 'id' | 'createdAt' | 'planId' | 'flagId'> & {
  /** Plan link: a plan id links/moves the row, null unlinks it, absent leaves it unchanged. */
  planId?: number | null
  /** Flag link: an id flags the row, null clears it, absent leaves it unchanged. */
  flagId?: number | null
}
export type BulkTransactionPatch = Partial<
  Pick<NewTransaction, 'categoryId' | 'accountId' | 'type' | 'date' | 'budgetMonth'>
>

export type NewCategory = Omit<Category, 'id'>
export type NewAccount = Omit<Account, 'id'>
export type NewFlag = Omit<Flag, 'id'>

/**
 * Exactly one of `reassignToId` / `createCategory` should be set when the
 * category being deleted is in use; omit both to delete an unused category.
 */
export interface DeleteCategoryOptions {
  reassignToId?: number
  createCategory?: NewCategory
}
export interface DeleteCategoryResult {
  /** The id transactions/plans were moved to, or null when nothing needed reassigning. */
  reassignedToId: number | null
  /** Present when `createCategory` was used to make the reassign target. */
  createdCategory?: Category
}

/** Same contract as {@link DeleteCategoryOptions}, for accounts. */
export interface DeleteAccountOptions {
  reassignToId?: number
  createAccount?: NewAccount
}
export interface DeleteAccountResult {
  reassignedToId: number | null
  createdAccount?: Account
}
export type NewGoalScenario = Omit<GoalScenario, 'id'>
export type NewWealthAccount = Omit<WealthAccount, 'id'>
export type NewWealthCheckin = {
  checkinDate: string
  note?: string
  entries: WealthCheckinEntry[]
}
export type NewInstallmentPlan = Omit<InstallmentPlan, 'id' | 'dueDayOfMonth'> & {
  /** A day (1-31) sets the due day, null clears it, absent leaves it unchanged. */
  dueDayOfMonth?: number | null
}

export interface ExpenseDataSource {
  /** Whether mutations are supported; the UI hides add/edit when false. */
  readonly canWrite: boolean
  load(): Promise<ExpenseDataset>
  createTransaction?(input: NewTransaction): Promise<Transaction>
  createTransactions?(inputs: NewTransaction[]): Promise<Transaction[]>
  updateTransaction?(id: number, patch: Partial<NewTransaction>): Promise<Transaction>
  deleteTransaction?(id: number): Promise<void>
  deleteTransactions?(ids: number[]): Promise<{ deleted: number; requested: number }>
  updateTransactions?(
    ids: number[],
    patch: BulkTransactionPatch,
  ): Promise<{ updated: number; transactions: Transaction[] }>
  setStatementPaid?(accountId: number, yearMonth: string, paid: boolean, paidOn?: string): Promise<AccountStatement>
  /** Record actual cash for a month, or pass null to clear (empty Actual field). */
  setCashActual?(yearMonth: string, actualCashCents: number | null): Promise<CashActual | null>
  // Definitions — categories, accounts, opening balances, goal inputs.
  createCategory?(input: NewCategory): Promise<Category>
  updateCategory?(id: number, patch: Partial<NewCategory>): Promise<Category>
  deleteCategory?(id: number, options?: DeleteCategoryOptions): Promise<DeleteCategoryResult>
  createAccount?(input: NewAccount): Promise<Account>
  updateAccount?(id: number, patch: Partial<NewAccount>): Promise<Account>
  deleteAccount?(id: number, options?: DeleteAccountOptions): Promise<DeleteAccountResult>
  createFlag?(input: NewFlag): Promise<Flag>
  updateFlag?(id: number, patch: Partial<NewFlag>): Promise<Flag>
  /** Deleting a flag clears it from its transactions; the result says how many. */
  deleteFlag?(id: number): Promise<{ unflagged: number }>
  /** Apply (or clear, with null) one flag across many transactions at once. */
  setTransactionsFlag?(ids: number[], flagId: number | null): Promise<Transaction[]>
  updateSettings?(patch: Partial<ExpenseSettings>): Promise<ExpenseSettings>
  updateGoals?(patch: Partial<GoalInputs>): Promise<GoalInputs>
  createScenario?(input: NewGoalScenario): Promise<GoalScenario>
  updateScenario?(id: number, patch: Partial<NewGoalScenario>): Promise<GoalScenario>
  deleteScenario?(id: number): Promise<void>
  createInstallmentPlan?(input: NewInstallmentPlan): Promise<InstallmentPlan>
  updateInstallmentPlan?(id: number, patch: Partial<NewInstallmentPlan>): Promise<InstallmentPlan>
  deleteInstallmentPlan?(id: number): Promise<void>
  createWealthAccount?(input: NewWealthAccount): Promise<WealthAccount>
  updateWealthAccount?(id: number, patch: Partial<NewWealthAccount>): Promise<WealthAccount>
  deleteWealthAccount?(id: number): Promise<void>
  createWealthCheckin?(input: NewWealthCheckin): Promise<WealthCheckin>
  updateWealthCheckin?(id: number, patch: Partial<NewWealthCheckin>): Promise<WealthCheckin>
  deleteWealthCheckin?(id: number): Promise<void>
}
