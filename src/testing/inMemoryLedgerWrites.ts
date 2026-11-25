import type { ExpenseLedgerWrites } from '../domain/ports/expenseLedger'
import type { AccountStatement, CashActual } from '../domain/types'
import { addLabelsToTransactions, bulkUpdateTransactions, bulkUpdateTransactionsByFilter } from './inMemoryBulkWrites'
import { assertOwnedAccount } from './inMemoryGuards'
import { type InMemoryState, type Op, using } from './inMemoryStore'
import {
  bulkInsertTransactions,
  deleteTransaction,
  deleteTransactions,
  insertTransaction,
  updateTransaction,
} from './inMemoryTransactionWrites'

export const setStatementPaid: Op<'setStatementPaid'> = (
  state,
  owner,
  accountId,
  yearMonth,
  paid,
  paidOn,
) => {
  const store = state.storeFor(owner)
  assertOwnedAccount(store, accountId)
  if (paid && !paidOn) {
    return Promise.reject(new Error('paidOn is required when paid is true'))
  }
  const existing = store.statements.find((s) => s.accountId === accountId && s.yearMonth === yearMonth)
  if (existing) {
    existing.paid = paid
    if (paid && paidOn) existing.paidOn = paidOn
    else delete existing.paidOn
    return Promise.resolve({ ...existing })
  }
  const statement: AccountStatement = {
    accountId,
    yearMonth,
    paid,
    ...(paid && paidOn ? { paidOn } : {}),
  }
  store.statements.push(statement)
  return Promise.resolve({ ...statement })
}

export const setCashActual: Op<'setCashActual'> = (
  state,
  owner,
  yearMonth,
  actualCashCents,
) => {
  const store = state.storeFor(owner)
  const existing = store.cashActuals.find((c) => c.yearMonth === yearMonth)
  if (existing) {
    existing.actualCashCents = actualCashCents
    return Promise.resolve({ ...existing })
  }
  const row: CashActual = { yearMonth, actualCashCents }
  store.cashActuals.push(row)
  return Promise.resolve({ ...row })
}

export const clearCashActual: Op<'clearCashActual'> = (
  state,
  owner,
  yearMonth,
) => {
  const store = state.storeFor(owner)
  store.cashActuals = store.cashActuals.filter((c) => c.yearMonth !== yearMonth)
  return Promise.resolve()
}

export function ledgerWrites(state: InMemoryState): ExpenseLedgerWrites {
  return {
    insertTransaction: using(state, insertTransaction),
    updateTransaction: using(state, updateTransaction),
    deleteTransaction: using(state, deleteTransaction),
    deleteTransactions: using(state, deleteTransactions),
    bulkUpdateTransactions: using(state, bulkUpdateTransactions),
    bulkUpdateTransactionsByFilter: using(state, bulkUpdateTransactionsByFilter),
    addLabelsToTransactions: using(state, addLabelsToTransactions),
    setStatementPaid: using(state, setStatementPaid),
    setCashActual: using(state, setCashActual),
    clearCashActual: using(state, clearCashActual),
    bulkInsertTransactions: using(state, bulkInsertTransactions),
  }
}
