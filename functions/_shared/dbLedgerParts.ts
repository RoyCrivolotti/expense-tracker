import type {
  AttachmentCounts,
  LedgerReferenceRead,
  MonthRange,
  MonthRowsRead,
} from '../domain/data/ledgerParts'
import type { MonthCell } from '../domain/ledger/types'
import { deriveStatus } from '../domain/engine/status'
import type { AccountStatement, StoredTransaction, Transaction, TxnStatus, TxnType } from '../domain/types'
import type { Env } from './env'
import { loadReferenceTables } from './dbReference'
import {
  accountsSql,
  cubeSql,
  monthCountsSql,
  monthRowsSql,
  paidStatementsSql,
  paymentsSql,
  pinnedSql,
} from './ledgerPartsSql'
import { toAccount, toStatement, toStoredTxn, type AccountRow, type StatementRow, type TxnRow } from './rows'
import type { Sql } from './transactionQuerySql'

/** A row as the part reads select it, before its status. */
interface LeanRow extends TxnRow {
  /** JSON array of label ids. */
  label_ids: string
  receipts: number
}

interface PartRow extends LeanRow {
  status: TxnStatus
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

/**
 * `date DESC, id DESC`, the order the API returns rows in. An id is unique, so no two rows tie. Dates are
 * `YYYY-MM-DD`, which JavaScript and SQLite's binary collation compare alike.
 */
const byNewest = (a: { date: string; id: number }, b: { date: string; id: number }): number =>
  a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1

/** The indexed pinned rows, which are in order, with the few payments that are pinned by a link. */
function newestFirst(indexed: PartRow[], payments: PartRow[]): PartRow[] {
  if (payments.length === 0) return indexed
  return [...indexed, ...payments].sort(byNewest)
}

function transactionsOf<R extends LeanRow>(
  rows: R[],
  statusOf: (stored: StoredTransaction, row: R) => TxnStatus,
): { transactions: Transaction[]; attachmentCounts: AttachmentCounts } {
  const attachmentCounts: AttachmentCounts = {}
  const transactions = rows.map((row) => {
    if (row.receipts > 0) attachmentCounts[row.id] = row.receipts
    const stored = toStoredTxn(row)
    return { ...stored, status: statusOf(stored, row), labelIds: labelIdsOf(row.label_ids) }
  })
  return { transactions, attachmentCounts }
}

/**
 * `deriveTransactions` for one row at a time, from the owner's accounts and the paid statements of a range. A
 * row whose account is not there is posted, cancelled or not. Statements are grouped by account, so a row looks
 * through its own account's few and not all of them.
 */
function statusReader(accountRows: AccountRow[], paidRows: StatementRow[]): (stored: StoredTransaction) => TxnStatus {
  const accounts = new Map(accountRows.map((row) => [row.id, toAccount(row)]))
  const paid = new Map<number, AccountStatement[]>()
  for (const row of paidRows) {
    const statement = toStatement(row)
    const own = paid.get(statement.accountId)
    if (own) own.push(statement)
    else paid.set(statement.accountId, [statement])
  }
  return (stored) => {
    const account = accounts.get(stored.accountId)
    return account ? deriveStatus(stored, account, paid.get(stored.accountId) ?? []) : 'posted'
  }
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
  const { transactions, attachmentCounts } = transactionsOf(newestFirst(indexed, payments), (_, row) => row.status)
  return {
    reference,
    pinned: transactions,
    attachmentCounts,
    months: counts.map((c) => c.budget_month),
    rowsPerMonth,
    rowCount,
  }
}

/**
 * Every row of the range, or null when it holds more than `maxRows`. The rows, the accounts and the paid
 * statements go in one batch, so the status of a row is worked out from the same moment it was read at.
 */
export async function readMonthRows(
  env: Env,
  owner: string,
  range: MonthRange,
  maxRows: number,
): Promise<MonthRowsRead | null> {
  const [rows, accounts, paid] = await env.DB.batch([
    statement(monthRowsSql(owner, range, maxRows), env),
    statement(accountsSql(owner), env),
    statement(paidStatementsSql(owner, range), env),
  ])
  const picked = (rows?.results ?? []) as LeanRow[]
  if (picked.length > maxRows) return null
  const statusOf = statusReader((accounts?.results ?? []) as AccountRow[], (paid?.results ?? []) as StatementRow[])
  return transactionsOf(picked.sort(byNewest), statusOf)
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
