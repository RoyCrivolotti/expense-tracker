import type { ExpenseRepository } from '../../domain/ports/expenseRepository'
import type { Env } from '../env'
import { loadDataset, listOwners } from '../db'
import {
  bulkInsertTransactions,
  clearCashActual,
  deleteTransaction,
  deleteTransactions,
  insertTransaction,
  setCashActual,
  setStatementPaid,
  updateTransaction,
} from '../dbWrite'
import {
  createAccount,
  createCategory,
  createScenario,
  deleteScenario,
  updateAccount,
  updateCategory,
  updateGoals,
  updateScenario,
  updateSettings,
} from '../dbConfig'

/** Cloudflare D1 adapter for {@link ExpenseRepository}. */
export function createD1ExpenseRepository(env: Env): ExpenseRepository {
  return {
    loadDataset: (owner) => loadDataset(env, owner),
    listOwners: () => listOwners(env),
    insertTransaction: (owner, input) => insertTransaction(env, owner, input),
    updateTransaction: (owner, id, patch) => updateTransaction(env, owner, id, patch),
    deleteTransaction: (owner, id) => deleteTransaction(env, owner, id),
    deleteTransactions: (owner, ids) => deleteTransactions(env, owner, ids),
    setStatementPaid: (owner, accountId, yearMonth, paid) =>
      setStatementPaid(env, owner, accountId, yearMonth, paid),
    setCashActual: (owner, yearMonth, cents) => setCashActual(env, owner, yearMonth, cents),
    clearCashActual: (owner, yearMonth) => clearCashActual(env, owner, yearMonth),
    createCategory: (owner, input) => createCategory(env, owner, input),
    updateCategory: (owner, id, patch) => updateCategory(env, owner, id, patch),
    createAccount: (owner, input) => createAccount(env, owner, input),
    updateAccount: (owner, id, patch) => updateAccount(env, owner, id, patch),
    updateSettings: (owner, patch) => updateSettings(env, owner, patch),
    updateGoals: (owner, patch) => updateGoals(env, owner, patch),
    createScenario: (owner, input) => createScenario(env, owner, input),
    updateScenario: (owner, id, patch) => updateScenario(env, owner, id, patch),
    deleteScenario: (owner, id) => deleteScenario(env, owner, id),
    bulkInsertTransactions: (owner, inputs) => bulkInsertTransactions(env, owner, inputs),
  }
}
