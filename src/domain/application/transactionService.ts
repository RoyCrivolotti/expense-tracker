import type { NewTransaction } from '../data/dataSource'
import { parseDeleteTransactionIds } from '../data/transactionIds'
import type { ExpenseRepository } from '../ports/expenseRepository'
import { validateTransactionPatch } from './transactionPatchValidation'
import { validateBulkTransactions, validateBulkUpdatePatch, validateNewTransaction } from './transactionValidation'

export async function bulkCreateTransactions(
  repo: ExpenseRepository,
  owner: string,
  raw: unknown,
) {
  const inputs = validateBulkTransactions(raw)
  const created = await repo.bulkInsertTransactions(owner, inputs)
  return { created: created.length, transactions: created }
}

export async function bulkDeleteTransactions(
  repo: ExpenseRepository,
  owner: string,
  rawIds: unknown,
) {
  const ids = parseDeleteTransactionIds(rawIds)
  const deleted = await repo.deleteTransactions(owner, ids)
  return { deleted, requested: ids.length }
}

export async function bulkUpdateTransactions(
  repo: ExpenseRepository,
  owner: string,
  rawIds: unknown,
  rawPatch: unknown,
) {
  const ids = parseDeleteTransactionIds(rawIds)
  const patch = validateBulkUpdatePatch(rawPatch)
  const transactions = await repo.bulkUpdateTransactions(owner, ids, patch)
  return { updated: transactions.length, transactions }
}

export async function createTransaction(
  repo: ExpenseRepository,
  owner: string,
  input: NewTransaction,
) {
  return repo.insertTransaction(owner, validateNewTransaction(input))
}

export async function patchTransaction(
  repo: ExpenseRepository,
  owner: string,
  id: number,
  patch: Partial<NewTransaction>,
) {
  return repo.updateTransaction(owner, id, validateTransactionPatch(patch))
}

export async function removeTransaction(
  repo: ExpenseRepository,
  owner: string,
  id: number,
) {
  return repo.deleteTransaction(owner, id)
}
