import type { NewTransaction } from '../data/dataSource'
import type { ExpenseRepository } from '../ports/expenseRepository'
import type { ExpenseSettings } from '../types'

export function validateNewTransaction(input: NewTransaction): NewTransaction {
  if (!input.date || !input.budgetMonth || !input.accountId || !input.categoryId) {
    throw new Error('date, budgetMonth, accountId and categoryId are required')
  }
  if (!Number.isFinite(input.amountCents)) throw new Error('amountCents must be a number')
  return input
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
