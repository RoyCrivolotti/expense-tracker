import type {
  AttachmentCounts,
  LedgerReferenceRead,
  MonthRange,
  MonthRowsRead,
} from '../domain/data/ledgerParts'
import type { MonthCell } from '../domain/ledger/types'
import type { Transaction, TxnStatus, TxnType } from '../domain/types'
import type { Env } from './env'
import { loadReferenceTables } from './dbReference'
import { cubeSql, monthCountsSql, monthRowsSql, paymentsSql, pinnedSql } from './ledgerPartsSql'
import { toStoredTxn, type TxnRow } from './rows'
import type { Sql } from './transactionQuerySql'

interface PartRow extends TxnRow {
  status: TxnStatus
  /** JSON array of label ids. */
  label_ids: string
  receipts: number
}

interface CellRow {
  budget_month: string
  account_id: number
  category_id: number
  type: TxnType
  cancelled: number
  sign: -1 | 0 | 1
  amount_cents: number
  n: number
}

function statement({ sql, params }: Sql, env: Env): D1PreparedStatement {
  return env.DB.prepare(sql).bind(...params)
}

async function rowsOf<T>(query: Sql, env: Env): Promise<T[]> {
  return (await statement(query, env).all<T>()).results ?? []
}

/** The label ids a row carries, ascending as the paged reads give them; most rows carry none. */
function labelIdsOf(json: string): number[] {
  return json === '[]' ? [] : (JSON.parse(json) as number[]).sort((a, b) => a - b)
}

/** The indexed pinned rows, which are in order, with the few payments that are pinned by a link. */
function newestFirst(indexed: PartRow[], payments: PartRow[]): PartRow[] {
  if (payments.length === 0) return indexed
  return [...indexed, ...payments].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1))
}

function transactionsOf(rows: PartRow[]): { transactions: Transaction[]; attachmentCounts: AttachmentCounts } {
  const attachmentCounts: AttachmentCounts = {}
  const transactions = rows.map((row) => {
    if (row.receipts > 0) attachmentCounts[row.id] = row.receipts
    return { ...toStoredTxn(row), status: row.status, labelIds: labelIdsOf(row.label_ids) }
  })
  return { transactions, attachmentCounts }
}

/**
 * The reference tables, the pinned rows and what the ledger holds. One round of concurrent reads:
 * the twelve reference statements `loadDataset` runs, two for the pinned rows and one that counts rows
 * per budget month.
 */
export async function readLedgerReference(env: Env, owner: string): Promise<LedgerReferenceRead> {
  const [reference, indexed, payments, counts] = await Promise.all([
    loadReferenceTables(env, owner),
    rowsOf<PartRow>(pinnedSql(owner), env),
    rowsOf<PartRow>(paymentsSql(owner), env),
    rowsOf<{ budget_month: string; n: number }>(monthCountsSql(owner), env),
  ])
  const rowsPerMonth: Record<string, number> = {}
  let rowCount = 0
  for (const { budget_month, n } of counts) {
    rowsPerMonth[budget_month] = n
    rowCount += n
  }
  const { transactions, attachmentCounts } = transactionsOf(newestFirst(indexed, payments))
  return {
    reference,
    pinned: transactions,
    attachmentCounts,
    months: counts.map((c) => c.budget_month),
    rowsPerMonth,
    rowCount,
  }
}

/** Every row of the range, or null when it holds more than `maxRows`. */
export async function readMonthRows(
  env: Env,
  owner: string,
  range: MonthRange,
  maxRows: number,
): Promise<MonthRowsRead | null> {
  const rows = await rowsOf<PartRow>(monthRowsSql(owner, range, maxRows), env)
  return rows.length > maxRows ? null : transactionsOf(rows)
}

/** The cube of the range's unpinned rows, or null when it has more than `maxCells` cells. */
export async function readMonthCells(
  env: Env,
  owner: string,
  range: MonthRange,
  maxCells: number,
): Promise<MonthCell[] | null> {
  const rows = await rowsOf<CellRow>(cubeSql(owner, range, maxCells), env)
  if (rows.length > maxCells) return null
  return rows.map((r) => ({
    budgetMonth: r.budget_month,
    accountId: r.account_id,
    categoryId: r.category_id,
    type: r.type,
    cancelled: r.cancelled === 1,
    sign: r.sign,
    amountCents: r.amount_cents,
    count: r.n,
  }))
}
