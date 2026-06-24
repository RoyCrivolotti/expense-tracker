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
  GoalInputs,
  GoalScenario,
  StoredTransaction,
  Transaction,
} from '../types'

export type NewTransaction = Omit<StoredTransaction, 'id'>
export type NewCategory = Omit<Category, 'id'>
export type NewAccount = Omit<Account, 'id'>
export type NewGoalScenario = Omit<GoalScenario, 'id'>

export interface ExpenseDataSource {
  /** Whether mutations are supported; the UI hides add/edit when false. */
  readonly canWrite: boolean
  load(): Promise<ExpenseDataset>
  createTransaction?(input: NewTransaction): Promise<Transaction>
  createTransactions?(inputs: NewTransaction[]): Promise<Transaction[]>
  updateTransaction?(id: number, patch: Partial<NewTransaction>): Promise<Transaction>
  deleteTransaction?(id: number): Promise<void>
  deleteTransactions?(ids: number[]): Promise<{ deleted: number; requested: number }>
  setStatementPaid?(accountId: number, yearMonth: string, paid: boolean): Promise<AccountStatement>
  /** Record actual cash for a month, or pass null to clear (empty Actual field). */
  setCashActual?(yearMonth: string, actualCashCents: number | null): Promise<CashActual | null>
  // Definitions — categories, accounts, opening balances, goal inputs.
  createCategory?(input: NewCategory): Promise<Category>
  updateCategory?(id: number, patch: Partial<NewCategory>): Promise<Category>
  createAccount?(input: NewAccount): Promise<Account>
  updateAccount?(id: number, patch: Partial<NewAccount>): Promise<Account>
  updateSettings?(patch: Partial<ExpenseSettings>): Promise<ExpenseSettings>
  updateGoals?(patch: Partial<GoalInputs>): Promise<GoalInputs>
  createScenario?(input: NewGoalScenario): Promise<GoalScenario>
  updateScenario?(id: number, patch: Partial<NewGoalScenario>): Promise<GoalScenario>
  deleteScenario?(id: number): Promise<void>
}
