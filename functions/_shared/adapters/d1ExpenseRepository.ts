import type { ExpenseRepository } from '../../domain/ports/expenseRepository'
import type { Env } from '../env'
import { loadDataset, listOwners } from '../db'
import {
  bulkInsertTransactions,
  bulkUpdateTransactions,
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
  deleteAccount,
  deleteCategory,
  deleteScenario,
  updateAccount,
  updateCategory,
  updateGoals,
  updateScenario,
  updateSettings,
} from '../dbConfig'
import {
  createInstallmentPlan,
  deleteInstallmentPlan,
  updateInstallmentPlan,
} from '../dbInstallments'
import {
  createWealthAccount,
  createWealthCheckin,
  deleteWealthAccount,
  deleteWealthCheckin,
  updateWealthAccount,
  updateWealthCheckin,
} from '../dbWealth'

/** Cloudflare D1 adapter for {@link ExpenseRepository}. */
export function createD1ExpenseRepository(env: Env): ExpenseRepository {
  return {
    loadDataset: (owner) => loadDataset(env, owner),
    listOwners: () => listOwners(env),
    insertTransaction: (owner, input) => insertTransaction(env, owner, input),
    updateTransaction: (owner, id, patch) => updateTransaction(env, owner, id, patch),
    deleteTransaction: (owner, id) => deleteTransaction(env, owner, id),
    deleteTransactions: (owner, ids) => deleteTransactions(env, owner, ids),
    bulkUpdateTransactions: (owner, ids, patch) =>
      bulkUpdateTransactions(env, owner, ids, patch),
    setStatementPaid: (owner, accountId, yearMonth, paid, paidOn) =>
      setStatementPaid(env, owner, accountId, yearMonth, paid, paidOn),
    setCashActual: (owner, yearMonth, cents) => setCashActual(env, owner, yearMonth, cents),
    clearCashActual: (owner, yearMonth) => clearCashActual(env, owner, yearMonth),
    createCategory: (owner, input) => createCategory(env, owner, input),
    updateCategory: (owner, id, patch) => updateCategory(env, owner, id, patch),
    deleteCategory: (owner, id, options) => deleteCategory(env, owner, id, options),
    createAccount: (owner, input) => createAccount(env, owner, input),
    updateAccount: (owner, id, patch) => updateAccount(env, owner, id, patch),
    deleteAccount: (owner, id, options) => deleteAccount(env, owner, id, options),
    updateSettings: (owner, patch) => updateSettings(env, owner, patch),
    updateGoals: (owner, patch) => updateGoals(env, owner, patch),
    createScenario: (owner, input) => createScenario(env, owner, input),
    updateScenario: (owner, id, patch) => updateScenario(env, owner, id, patch),
    deleteScenario: (owner, id) => deleteScenario(env, owner, id),
    bulkInsertTransactions: (owner, inputs) => bulkInsertTransactions(env, owner, inputs),
    createInstallmentPlan: (owner, input) => createInstallmentPlan(env, owner, input),
    updateInstallmentPlan: (owner, id, patch) => updateInstallmentPlan(env, owner, id, patch),
    deleteInstallmentPlan: (owner, id) => deleteInstallmentPlan(env, owner, id),
    createWealthAccount: (owner, input) => createWealthAccount(env, owner, input),
    updateWealthAccount: (owner, id, patch) => updateWealthAccount(env, owner, id, patch),
    deleteWealthAccount: (owner, id) => deleteWealthAccount(env, owner, id),
    createWealthCheckin: (owner, input) => createWealthCheckin(env, owner, input),
    updateWealthCheckin: (owner, id, patch) => updateWealthCheckin(env, owner, id, patch),
    deleteWealthCheckin: (owner, id) => deleteWealthCheckin(env, owner, id),
  }
}
