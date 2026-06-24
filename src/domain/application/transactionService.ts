import type { NewTransaction } from '../data/dataSource'
import { parseDeleteTransactionIds } from '../data/transactionIds'
import type { ExpenseRepository } from '../ports/expenseRepository'
import type { ExpenseSettings } from '../types'

export function validateNewTransaction(input: NewTransaction): NewTransaction {
  if (!input.date || !input.budgetMonth || !input.accountId || !input.categoryId) {
    throw new Error('date, budgetMonth, accountId and categoryId are required')
  }
  if (!Number.isFinite(input.amountCents)) throw new Error('amountCents must be a number')
  return input
}

export function validateBulkTransactions(raw: unknown): NewTransaction[] {
  if (!Array.isArray(raw)) throw new Error('transactions array is required')
  return raw.map((item) => validateNewTransaction(item as NewTransaction))
}

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
  return repo.updateTransaction(owner, id, patch)
}

export async function removeTransaction(repo: ExpenseRepository, owner: string, id: number) {
  return repo.deleteTransaction(owner, id)
}

export async function saveSettings(
  repo: ExpenseRepository,
  owner: string,
  patch: Partial<ExpenseSettings>,
) {
  return repo.updateSettings(owner, patch)
}
