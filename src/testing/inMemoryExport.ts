import { exportCursorOf, statementPosition, type ExportChunk, type ExportChunkRequest, type ExportTable } from '../domain/data/exportTables'
import type { ExpenseDataset } from '../domain/types'

type Rows = Record<string, unknown>[]

/** The dataset's own rows for a table, with the same details the SQL path settles: label ids ascending. */
function rowsOf(dataset: ExpenseDataset, table: ExportTable): Rows {
  if (table === 'settings') return [dataset.settings as unknown as Record<string, unknown>]
  if (table === 'transactions') {
    return dataset.transactions.map((t) => ({ ...t, labelIds: [...(t.labelIds ?? [])].sort((a, b) => a - b) }))
  }
  return dataset[table] as unknown as Rows
}

const idOf = (row: Record<string, unknown>): number => Number(row.id)

/** Primary-key order, as the SQL reads each table. */
function inKeyOrder(table: ExportTable, rows: Rows): Rows {
  if (table === 'cashActuals') return [...rows].sort((a, b) => String(a.yearMonth).localeCompare(String(b.yearMonth)))
  if (table === 'accountStatements') {
    return [...rows].sort((a, b) => Number(a.accountId) - Number(b.accountId) || String(a.yearMonth).localeCompare(String(b.yearMonth)))
  }
  return [...rows].sort((a, b) => idOf(a) - idOf(b))
}

function isAfter(table: ExportTable, row: Record<string, unknown>, after: string): boolean {
  if (table === 'cashActuals') return String(row.yearMonth) > after
  if (table === 'accountStatements') {
    const position = statementPosition(after)
    const account = Number(row.accountId)
    return account > position.accountId || (account === position.accountId && String(row.yearMonth) > position.yearMonth)
  }
  return idOf(row) > Number(after)
}

/** The reference the SQL export is held to: the dataset's rows, cut at a position, as `loadDataset` hands them out. */
export function exportChunkOf(dataset: ExpenseDataset, { table, after, limit }: ExportChunkRequest): ExportChunk {
  const ordered = inKeyOrder(table, rowsOf(dataset, table))
  const rest = after === undefined ? ordered : ordered.filter((row) => isAfter(table, row, after))
  const rows = rest.slice(0, limit)
  const last = rows.at(-1)
  return { table, rows, next: rest.length > limit && last ? exportCursorOf(table, last) : null }
}
