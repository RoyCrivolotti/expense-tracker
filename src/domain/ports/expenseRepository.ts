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
  Transaction,
  WealthAccount,
  WealthCheckin,
} from '../types'
import type {
  BulkTransactionPatch,
  DeleteAccountOptions,
  DeleteAccountResult,
  DeleteCategoryOptions,
  DeleteCategoryResult,
  NewAccount,
  NewCategory,
  NewFlag,
  NewGoalScenario,
  NewInstallmentPlan,
  NewTransaction,
  NewWealthAccount,
  NewWealthCheckin,
} from '../data/dataSource'

/** Persistence port — UI/API depend on this shape, not on D1 or any vendor SDK. */
export interface ExpenseRepository {
  loadDataset(owner: string): Promise<ExpenseDataset>
  listOwners(): Promise<string[]>
  insertTransaction(owner: string, input: NewTransaction): Promise<Transaction>
  updateTransaction(
    owner: string,
    id: number,
    patch: Partial<NewTransaction>,
  ): Promise<Transaction>
  deleteTransaction(owner: string, id: number): Promise<void>
  deleteTransactions(owner: string, ids: number[]): Promise<number>
  bulkUpdateTransactions(
    owner: string,
    ids: number[],
    patch: BulkTransactionPatch,
  ): Promise<Transaction[]>
  setStatementPaid(
    owner: string,
    accountId: number,
    yearMonth: string,
    paid: boolean,
    paidOn?: string,
  ): Promise<AccountStatement>
  setCashActual(owner: string, yearMonth: string, actualCashCents: number): Promise<CashActual>
  clearCashActual(owner: string, yearMonth: string): Promise<void>
  createCategory(owner: string, input: NewCategory): Promise<Category>
  updateCategory(owner: string, id: number, patch: Partial<NewCategory>): Promise<Category>
  deleteCategory(
    owner: string,
    id: number,
    options?: DeleteCategoryOptions,
  ): Promise<DeleteCategoryResult>
  createAccount(owner: string, input: NewAccount): Promise<Account>
  updateAccount(owner: string, id: number, patch: Partial<NewAccount>): Promise<Account>
  deleteAccount(
    owner: string,
    id: number,
    options?: DeleteAccountOptions,
  ): Promise<DeleteAccountResult>
  createFlag(owner: string, input: NewFlag): Promise<Flag>
  updateFlag(owner: string, id: number, patch: Partial<NewFlag>): Promise<Flag>
  /** Deletes the flag and clears it from its transactions in one batch. */
  deleteFlag(owner: string, id: number): Promise<{ unflagged: number }>
  setTransactionsFlag(owner: string, ids: number[], flagId: number | null): Promise<Transaction[]>
  updateSettings(owner: string, patch: Partial<ExpenseSettings>): Promise<ExpenseSettings>
  updateGoals(owner: string, patch: Partial<GoalInputs>): Promise<GoalInputs>
  createScenario(owner: string, input: NewGoalScenario): Promise<GoalScenario>
  updateScenario(
    owner: string,
    id: number,
    patch: Partial<NewGoalScenario>,
  ): Promise<GoalScenario>
  deleteScenario(owner: string, id: number): Promise<void>
  bulkInsertTransactions(owner: string, inputs: NewTransaction[]): Promise<Transaction[]>
  createInstallmentPlan(owner: string, input: NewInstallmentPlan): Promise<InstallmentPlan>
  updateInstallmentPlan(
    owner: string,
    id: number,
    patch: Partial<NewInstallmentPlan>,
  ): Promise<InstallmentPlan>
  deleteInstallmentPlan(owner: string, id: number): Promise<void>
  createWealthAccount(owner: string, input: NewWealthAccount): Promise<WealthAccount>
  updateWealthAccount(owner: string, id: number, patch: Partial<NewWealthAccount>): Promise<WealthAccount>
  deleteWealthAccount(owner: string, id: number): Promise<void>
  createWealthCheckin(owner: string, input: NewWealthCheckin): Promise<WealthCheckin>
  updateWealthCheckin(owner: string, id: number, patch: Partial<NewWealthCheckin>): Promise<WealthCheckin>
  deleteWealthCheckin(owner: string, id: number): Promise<void>
}
