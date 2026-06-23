import type { ExpenseSettings, GoalInputs, Transaction, TxnType } from '../types'
import type { NewAccount, NewCategory } from '../data/dataSource'

/** Pre-filled fields passed to the add modal from a recurring suggestion. */
export interface TransactionSeed {
  description: string
  type: TxnType
  accountId: number
  categoryId: number
  amountCents: number
  date: string
  budgetMonth: string
}

/**
 * Mutation handlers passed down to tabs only when the active data source can
 * write (the live D1 API). Read-only (CSV) sessions pass `undefined`, so the UI
 * hides add/edit/import affordances. Config savers re-load the dataset so derived
 * status / budgets refresh everywhere.
 */
export interface ExpenseActions {
  onEdit: (txn: Transaction) => void
  onAdd: (seed?: TransactionSeed) => void
  deleteTransaction: (id: number) => Promise<void>
  deleteTransactions: (ids: number[]) => Promise<void>
  setStatementPaid: (accountId: number, yearMonth: string, paid: boolean) => Promise<void>
  setCashActual: (yearMonth: string, actualCashCents: number | null) => Promise<void>
  createCategory: (input: NewCategory) => Promise<void>
  updateCategory: (id: number, patch: Partial<NewCategory>) => Promise<void>
  createAccount: (input: NewAccount) => Promise<void>
  updateAccount: (id: number, patch: Partial<NewAccount>) => Promise<void>
  updateSettings: (patch: Partial<ExpenseSettings>) => Promise<void>
  updateGoals: (patch: Partial<GoalInputs>) => Promise<void>
}

export type ExpenseModalState =
  | { mode: 'add'; seed?: TransactionSeed }
  | { mode: 'edit'; txn: Transaction }
  | null
