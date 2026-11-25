import { shiftBudgetMonth } from '../domain/engine/dates'
import type { MonthRange } from '../domain/data/ledgerParts'
import type { ExpenseDataset, TransactionAttachment } from '../domain/types'
import type { Cascade } from './ledgerCascade'
import type { Reconciled } from './ledgerReconcile'

/**
 * Whether a write changed rows, those held and those it did not show: a cascade does (the server moved, unlinked or
 * inserted rows) and so does marking a card statement paid or unpaid (it decides whether the rows it covers are posted),
 * so a list read from the server is read again.
 */
export function showsRowsChanged(
  done: Reconciled,
  cascade: Cascade | null,
  before: ExpenseDataset,
  after: ExpenseDataset,
): boolean {
  const statements = JSON.stringify(before.accountStatements) !== JSON.stringify(after.accountStatements)
  return done.changed.rows || cascade !== null || statements
}

/** Consecutive months as ranges, so that reading a few months again does not read the span between them. */
export function rangesOfMonths(months: readonly string[]): MonthRange[] {
  const ranges: MonthRange[] = []
  for (const month of [...months].sort()) {
    const last = ranges[ranges.length - 1]
    if (last && shiftBudgetMonth(last.to, 1) === month) last.to = month
    else if (!last || last.to !== month) ranges.push({ from: month, to: month })
  }
  return ranges
}

/** The receipts grouped by the transaction they belong to. */
export function receiptsByTransaction(all: readonly TransactionAttachment[]): Map<number, TransactionAttachment[]> {
  const byTransaction = new Map<number, TransactionAttachment[]>()
  for (const receipt of all) {
    const list = byTransaction.get(receipt.transactionId)
    if (list) list.push(receipt)
    else byTransaction.set(receipt.transactionId, [receipt])
  }
  return byTransaction
}

/** The series held were read after the last write that touched them, under the revision the rows were read under. */
export function seriesAreCurrent(
  read: { revision: string; writes: number } | null,
  writes: number,
  revision: string | null,
): boolean {
  return read !== null && read.writes === writes && (revision === null || revision === read.revision)
}
