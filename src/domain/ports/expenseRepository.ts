import type {
  Account,
  AccountStatement,
  CashActual,
  Category,
  ExpenseDataset,
  ExpenseSettings,
  GoalInputs,
  GoalScenario,
  Transaction,
} from '../types'
import type { NewAccount, NewCategory, NewGoalScenario, NewTransaction } from '../data/dataSource'

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
  setStatementPaid(
    owner: string,
    accountId: number,
    yearMonth: string,
    paid: boolean,
  ): Promise<AccountStatement>
  setCashActual(owner: string, yearMonth: string, actualCashCents: number): Promise<CashActual>
  clearCashActual(owner: string, yearMonth: string): Promise<void>
  createCategory(owner: string, input: NewCategory): Promise<Category>
  updateCategory(owner: string, id: number, patch: Partial<NewCategory>): Promise<Category>
  createAccount(owner: string, input: NewAccount): Promise<Account>
  updateAccount(owner: string, id: number, patch: Partial<NewAccount>): Promise<Account>
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
}
