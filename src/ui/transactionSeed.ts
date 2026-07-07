import type { Transaction } from '../types'
import type { TransactionSeed } from './actions'

const TXN_TYPES = new Set(['expense', 'income', 'investment', 'refund'])
const SEED_KEYS = [
  'description',
  'type',
  'accountId',
  'categoryId',
  'amountCents',
  'date',
  'budgetMonth',
] as const

function isClickEvent(value: Record<string, unknown>): boolean {
  return typeof value.preventDefault === 'function' && !('accountId' in value) && !('date' in value)
}

/** True when value looks like a partial transaction seed, not a DOM/React event. */
export function isTransactionSeed(value: unknown): value is TransactionSeed {
  if (value == null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (isClickEvent(v)) return false
  if (typeof v.type === 'string' && !TXN_TYPES.has(v.type) && v.type === 'click') return false
  return SEED_KEYS.some((key) => key in v)
}

export function transactionToSeed(txn: Transaction): TransactionSeed {
  return {
    description: txn.description,
    type: txn.type,
    accountId: txn.accountId,
    categoryId: txn.categoryId,
    amountCents: txn.amountCents,
    date: txn.date,
    budgetMonth: txn.budgetMonth,
  }
}

export function duplicateHint(txn: Transaction): string {
  const label = txn.description.trim() || 'transaction'
  return `Copied from ${label}`
}

export function openAddModal(
  openModal: (state: { mode: 'add'; seed?: TransactionSeed; hint?: string }) => void,
  maybeSeed?: unknown,
): void {
  if (isTransactionSeed(maybeSeed)) openModal({ mode: 'add', seed: maybeSeed })
  else openModal({ mode: 'add' })
}
