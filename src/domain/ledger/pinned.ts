import type { StoredTransaction } from '../types'

/**
 * The payments that settled other rows. A past report is read back from the payment, and the rows it
 * covered are found through it.
 */
export function settlementPaymentIds(rows: readonly StoredTransaction[]): Set<number> {
  const ids = new Set<number>()
  for (const row of rows) if (row.settledBy != null) ids.add(row.settledBy)
  return ids
}

/**
 * Whether a row has to stay real whatever its age. Portfolio return and gap split read investments by
 * exact date and sign; instalment progress, flagged groups, past reports and reimbursement links follow
 * `planId`, `flagId`, `settledBy` and `reportCount` across months. `payments` comes from
 * `settlementPaymentIds` over the whole ledger.
 */
export function isPinned(row: StoredTransaction, payments: ReadonlySet<number>): boolean {
  return (
    row.type === 'investment' ||
    row.planId != null ||
    row.flagId != null ||
    row.settledBy != null ||
    payments.has(row.id) ||
    (row.reportCount ?? 0) > 0
  )
}

/** Splits a full row list into the pinned rows and the rest, keeping the order. */
export function partitionPinned<T extends StoredTransaction>(rows: readonly T[]): { pinned: T[]; rest: T[] } {
  const payments = settlementPaymentIds(rows)
  const pinned: T[] = []
  const rest: T[] = []
  for (const row of rows) (isPinned(row, payments) ? pinned : rest).push(row)
  return { pinned, rest }
}
