import type {
  ExpenseSettings,
  GoalInputs,
  GoalScenario,
  InstallmentPlan,
  Transaction,
  TxnType,
} from '../types'
import type {
  NewAccount,
  NewCategory,
  NewGoalScenario,
  NewInstallmentPlan,
  NewTransaction,
} from '../data/dataSource'

/** Pre-filled fields for the add modal (partial overlay on defaults). */
export interface TransactionSeed {
  description?: string
  type?: TxnType
  accountId?: number
  categoryId?: number
  amountCents?: number
  date?: string
  budgetMonth?: string
  /** When set, the created transaction settles this installment plan. */
  planId?: number
  /** Installment number this payment represents (for the modal hint only). */
  installmentIndex?: number
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
  onDuplicate: (txn: Transaction) => void
  createTransaction: (input: NewTransaction) => Promise<void>
  createTransactions: (inputs: NewTransaction[]) => Promise<void>
  updateTransaction: (id: number, patch: Partial<NewTransaction>) => Promise<void>
  deleteTransaction: (id: number) => Promise<void>
  deleteTransactions: (ids: number[]) => Promise<void>
  setStatementPaid: (
    accountId: number,
    yearMonth: string,
    paid: boolean,
    paidOn?: string,
  ) => Promise<void>
  setCashActual: (yearMonth: string, actualCashCents: number | null) => Promise<void>
  createCategory: (input: NewCategory) => Promise<void>
  updateCategory: (id: number, patch: Partial<NewCategory>) => Promise<void>
  createAccount: (input: NewAccount) => Promise<void>
  updateAccount: (id: number, patch: Partial<NewAccount>) => Promise<void>
  updateSettings: (patch: Partial<ExpenseSettings>) => Promise<void>
  updateGoals: (patch: Partial<GoalInputs>) => Promise<void>
  createScenario: (input: NewGoalScenario) => Promise<GoalScenario>
  updateScenario: (id: number, patch: Partial<NewGoalScenario>) => Promise<void>
  deleteScenario: (id: number) => Promise<void>
  createInstallmentPlan: (input: NewInstallmentPlan) => Promise<InstallmentPlan>
  updateInstallmentPlan: (id: number, patch: Partial<NewInstallmentPlan>) => Promise<void>
  deleteInstallmentPlan: (id: number) => Promise<void>
}

export type ExpenseModalState =
  | { mode: 'add'; seed?: TransactionSeed; hint?: string }
  | { mode: 'edit'; txn: Transaction }
  | null
