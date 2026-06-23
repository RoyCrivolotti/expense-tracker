import type { TransactionSeed } from './actions'

const TXN_TYPES = new Set(['expense', 'income', 'investment', 'refund'])

/** True when value looks like a recurring-suggestion seed, not a DOM/React event. */
export function isTransactionSeed(value: unknown): value is TransactionSeed {
  if (value == null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.description === 'string' &&
    typeof v.type === 'string' &&
    TXN_TYPES.has(v.type) &&
    typeof v.accountId === 'number' &&
    typeof v.categoryId === 'number' &&
    typeof v.amountCents === 'number' &&
    typeof v.date === 'string' &&
    typeof v.budgetMonth === 'string'
  )
}

export function openAddModal(
  openModal: (state: { mode: 'add'; seed?: TransactionSeed }) => void,
  maybeSeed?: unknown,
): void {
  if (isTransactionSeed(maybeSeed)) openModal({ mode: 'add', seed: maybeSeed })
  else openModal({ mode: 'add' })
}
