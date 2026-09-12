import type { BulkTransactionPatch, NewTransaction } from '../data/dataSource'
import { parseDeleteTransactionIds } from '../data/transactionIds'
import type { ExpenseRepository } from '../ports/expenseRepository'
import type { ExpenseSettings, TxnType } from '../types'

const BULK_PATCH_KEYS = new Set<string>([
  'categoryId',
  'accountId',
  'type',
  'date',
  'budgetMonth',
  'flagId',
  'settledBy',
])

const VALID_TXN_TYPES = new Set<string>(['expense', 'income', 'investment', 'refund'])

function requirePositiveInt(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) throw new Error(`Invalid ${label}`)
  return value as number
}

function requirePattern(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(label)
  return value
}

const FIELD_VALIDATORS: Record<string, (v: unknown, p: BulkTransactionPatch) => void> = {
  categoryId: (v, p) => { p.categoryId = requirePositiveInt(v, 'categoryId') },
  accountId: (v, p) => { p.accountId = requirePositiveInt(v, 'accountId') },
  type: (v, p) => {
    if (!VALID_TXN_TYPES.has(v as string)) throw new Error('Invalid transaction type')
    p.type = v as TxnType
  },
  date: (v, p) => { p.date = requirePattern(v, /^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD') },
  budgetMonth: (v, p) => { p.budgetMonth = requirePattern(v, /^\d{4}-\d{2}$/, 'budgetMonth must be YYYY-MM') },
  // null is meaningful here: it is how a selection is unflagged.
  flagId: (v, p) => { p.flagId = v === null ? null : requirePositiveInt(v, 'flagId') },
  // Likewise: null is how deleting a reimbursement releases the rows it covered.
  settledBy: (v, p) => { p.settledBy = v === null ? null : requirePositiveInt(v, 'settledBy') },
}

export function validateBulkUpdatePatch(raw: unknown): BulkTransactionPatch {
  if (raw == null || typeof raw !== 'object') throw new Error('patch is required')
  const obj = raw as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    if (!BULK_PATCH_KEYS.has(key)) throw new Error(`Field "${key}" is not bulk-editable`)
  }
  const patch: BulkTransactionPatch = {}
  for (const key of Object.keys(obj)) {
    if (obj[key] !== undefined) FIELD_VALIDATORS[key]!(obj[key], patch)
  }
  if (Object.keys(patch).length === 0) throw new Error('At least one field must be set')
  return patch
}

export function validateNewTransaction(input: NewTransaction): NewTransaction {
  if (!input.date || !input.budgetMonth || !input.accountId || !input.categoryId) {
    throw new Error('date, budgetMonth, accountId and categoryId are required')
  }
  // Matches installmentPlanService.ts's amountCents check: the UI forms already
  // enforce this for instant feedback, but this is the real source of truth —
  // any other caller (a future import path, a retry, a script) must be stopped
  // here too, not just trust the client.
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    throw new Error('amountCents must be greater than zero')
  }
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
