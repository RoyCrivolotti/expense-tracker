/**
 * The ledger parts computed with the pure ledger functions over a whole dataset: the reference the SQL
 * reads are held to. Nothing here knows about D1, so what a part is can be read off the model
 * (`partitionPinned`, `buildCells`) rather than off a query.
 */
import { sortedMonths } from '../domain/engine/dates'
import {
  type AttachmentCounts,
  type LedgerReferenceRead,
  type MonthRange,
  type MonthRowsRead,
  referenceTablesOf,
} from '../domain/data/ledgerParts'
import { buildCells, partitionPinned } from '../domain/ledger'
import type { MonthCell } from '../domain/ledger/types'
import type { ExpenseDataset, Transaction } from '../domain/types'

/** The order the API returns rows in, with label ids ascending as the paged reads give them. */
function apiOrder(dataset: ExpenseDataset): Transaction[] {
  return dataset.transactions
    .map((t) => ({ ...t, labelIds: [...(t.labelIds ?? [])].sort((a, b) => a - b) }))
    .sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1))
}

function receiptsOf(dataset: ExpenseDataset, rows: readonly Transaction[]): AttachmentCounts {
  const ids = new Set(rows.map((t) => t.id))
  const counts: AttachmentCounts = {}
  for (const a of dataset.attachments) {
    if (ids.has(a.transactionId)) counts[a.transactionId] = (counts[a.transactionId] ?? 0) + 1
  }
  return counts
}

const inRange = (month: string, range: MonthRange): boolean => month >= range.from && month <= range.to

export function ledgerReferenceOf(dataset: ExpenseDataset): LedgerReferenceRead {
  const rows = apiOrder(dataset)
  const pinned = partitionPinned(rows).pinned
  const rowsPerMonth: Record<string, number> = {}
  for (const row of rows) rowsPerMonth[row.budgetMonth] = (rowsPerMonth[row.budgetMonth] ?? 0) + 1
  return {
    reference: referenceTablesOf(dataset),
    pinned,
    attachmentCounts: receiptsOf(dataset, pinned),
    months: sortedMonths(Object.keys(rowsPerMonth)),
    rowsPerMonth,
    rowCount: rows.length,
  }
}

export function monthRowsOf(dataset: ExpenseDataset, range: MonthRange, maxRows: number): MonthRowsRead | null {
  const transactions = apiOrder(dataset).filter((t) => inRange(t.budgetMonth, range))
  if (transactions.length > maxRows) return null
  return { transactions, attachmentCounts: receiptsOf(dataset, transactions) }
}

export function monthCellsOf(dataset: ExpenseDataset, range: MonthRange, maxCells: number): MonthCell[] | null {
  const unpinned = partitionPinned(dataset.transactions).rest
  const cells = buildCells(unpinned.filter((t) => inRange(t.budgetMonth, range)))
  return cells.length > maxCells ? null : cells
}
