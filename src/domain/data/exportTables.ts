/**
 * The export reads a ledger a chunk at a time, one table after another, so that nothing has to hold all
 * of it: the CSV export and the backup both walk it with the `next` cursor each chunk hands back.
 * The tables are the keys of the dataset `GET /api/expenses` serves, and a row is the shape the dataset
 * carries for it (a transaction with its derived status and label ids, a check-in with its entries).
 */

/** Raise this when the shape of an exported row changes, so a reader can tell what it was handed. */
export const EXPORT_FORMAT = 1

/** In the order a restore has to insert them: a table comes after every table its rows refer to. */
export const EXPORT_TABLES = [
  'categories',
  'accounts',
  'labels',
  'flags',
  'accountStatements',
  'cashActuals',
  'settings',
  'goalScenarios',
  'installmentPlans',
  'wealthAccounts',
  'wealthCheckins',
  'transactions',
  'attachments',
] as const

export type ExportTable = (typeof EXPORT_TABLES)[number]

export function isExportTable(value: unknown): value is ExportTable {
  return typeof value === 'string' && (EXPORT_TABLES as readonly string[]).includes(value)
}

/**
 * The most rows one chunk may hold. Reading and serialising 5,000 transactions takes about 1.3 ms of
 * JavaScript on the SQLite stand-in (`functions/_shared/ledgerParts.scaling.test.ts`), which stands in for
 * Worker CPU against the Free plan's 10 ms and does not measure it. The other tables are small. A `limit`
 * above the bound is refused, never trimmed.
 */
export const EXPORT_CHUNK_ROWS: Record<ExportTable, number> = {
  categories: 1_000,
  accounts: 1_000,
  labels: 1_000,
  flags: 1_000,
  accountStatements: 1_000,
  cashActuals: 1_000,
  settings: 1,
  goalScenarios: 1_000,
  installmentPlans: 1_000,
  wealthAccounts: 1_000,
  wealthCheckins: 500,
  transactions: 5_000,
  attachments: 5_000,
}

export interface ExportChunkRequest {
  table: ExportTable
  /** The `next` of the chunk before it; absent for the first chunk of a table. */
  after?: string
  /** 1 to `EXPORT_CHUNK_ROWS[table]`. */
  limit: number
}

export interface ExportChunk {
  table: ExportTable
  rows: object[]
  /** Hand back as `after` for the next chunk; null when the table has no more rows. */
  next: string | null
}

const ID = /^[1-9]\d{0,15}$/
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const STATEMENT = /^([1-9]\d{0,15}):(\d{4}-(?:0[1-9]|1[0-2]))$/

/** Whether `after` is a position this table can start from. Cursors carry no owner. */
export function isExportCursor(table: ExportTable, after: string): boolean {
  if (table === 'settings') return false
  if (table === 'cashActuals') return MONTH.test(after)
  if (table === 'accountStatements') return STATEMENT.test(after)
  return ID.test(after)
}

/** Where a statement chunk starts, from the cursor of the one before it. */
export function statementPosition(after: string): { accountId: number; yearMonth: string } {
  const match = STATEMENT.exec(after)
  if (!match) throw new Error(`Not an account statement position: ${after}`)
  return { accountId: Number(match[1]), yearMonth: match[2] as string }
}

/** The cursor that continues after `row`, the last row of a chunk. */
export function exportCursorOf(table: ExportTable, row: object): string {
  const r = row as Record<string, unknown>
  if (table === 'cashActuals') return String(r.yearMonth)
  if (table === 'accountStatements') return `${String(r.accountId)}:${String(r.yearMonth)}`
  return String(r.id)
}
