/**
 * Read-only CSV data with canWrite enabled for README screenshot capture.
 * Mutations resolve immediately and are not persisted.
 */
import type {
  Account,
  AccountStatement,
  CashActual,
  Category,
  ExpenseDataset,
  ExpenseSettings,
  GoalInputs,
  Transaction,
} from '../types'
import type { ExpenseDataSource, NewAccount, NewCategory, NewTransaction } from './dataSource'
import { csvDataSource } from './csvDataSource'

let nextId = 900_000

function stubTxn(input: NewTransaction): Transaction {
  nextId += 1
  return {
    ...input,
    id: nextId,
    cancelled: false,
    status: 'posted',
  }
}

export const docsCaptureDataSource: ExpenseDataSource = {
  canWrite: true,
  load(): Promise<ExpenseDataset> {
    return csvDataSource.load()
  },
  createTransaction(input) {
    return Promise.resolve(stubTxn(input))
  },
  createTransactions(inputs) {
    return Promise.resolve(inputs.map((input) => stubTxn(input)))
  },
  updateTransaction(id, patch) {
    return Promise.resolve(stubTxn({ ...patch, id } as NewTransaction & { id: number }))
  },
  deleteTransaction() {
    return Promise.resolve()
  },
  deleteTransactions(ids) {
    return Promise.resolve({ deleted: ids.length, requested: ids.length })
  },
  setStatementPaid(accountId, yearMonth, paid) {
    const row: AccountStatement = { accountId, yearMonth, paid }
    return Promise.resolve(row)
  },
  setCashActual(yearMonth, actualCashCents) {
    if (actualCashCents === null) return Promise.resolve(null)
    const row: CashActual = { yearMonth, actualCashCents }
    return Promise.resolve(row)
  },
  createCategory(input: NewCategory) {
    nextId += 1
    const row: Category = { ...input, id: nextId, active: input.active ?? true }
    return Promise.resolve(row)
  },
  updateCategory(id, patch) {
    const row: Category = {
      id,
      name: patch.name ?? 'Category',
      monthlyBudgetCents: patch.monthlyBudgetCents ?? 0,
      sortOrder: patch.sortOrder ?? 0,
      active: patch.active ?? true,
      ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
    }
    return Promise.resolve(row)
  },
  createAccount(input: NewAccount) {
    nextId += 1
    const row: Account = { ...input, id: nextId, active: input.active ?? true }
    return Promise.resolve(row)
  },
  updateAccount(id, patch) {
    const row: Account = {
      id,
      name: patch.name ?? 'Account',
      kind: patch.kind ?? 'debit',
      settlement: patch.settlement ?? 'immediate',
      active: patch.active ?? true,
    }
    return Promise.resolve(row)
  },
  updateSettings(patch: Partial<ExpenseSettings>) {
    return Promise.resolve(patch as ExpenseSettings)
  },
  updateGoals(patch: Partial<GoalInputs>) {
    return Promise.resolve(patch as GoalInputs)
  },
}
