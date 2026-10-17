/**
 * SQL for the paged transaction reads. Every statement is built here and nowhere else, from a
 * filter the application layer has already validated, so the one place that turns `TxnFilter`
 * into a WHERE clause can be read against `filterTransactions` in the engine, which is the
 * specification. Values are always bound, never spliced into the text, and the number bound is
 * bounded by construction: the owner, one value per scalar field, one JSON string for the label
 * list, two per distinct accented letter of the search text (at most `MAX_CASE_FOLDS`) and the
 * cursor and limit. That stays far below D1's 100 bound parameters whatever the request holds.
 *
 * The owner is the first predicate of every statement and the only thing that scopes it; it is
 * never read from the filter.
 */
import { SUMMARY_COUNT_CAP, caseFolds } from '../domain/data/transactionQuery'
import type { TransactionKey } from '../domain/data/transactionQuery'
import type { TxnFilter } from '../domain/engine/transactions'
import { IN_ID_LIST, idList } from './sqlIdList'

export type SqlParam = string | number

export interface Sql {
  sql: string
  params: SqlParam[]
}

const AND = ' AND '
const none: Sql = { sql: '', params: [] }

/**
 * Same rules as `deriveStatus`: an account that is missing counts as posted (cancelled or not),
 * then cancelled, then the account's settlement, then whether its statement for the budget month
 * is paid.
 */
export const STATUS_SQL = `CASE
    WHEN a.id IS NULL THEN 'posted'
    WHEN t.cancelled = 1 THEN 'cancelled'
    WHEN a.settlement = 'immediate' THEN 'posted'
    WHEN s.paid = 1 THEN 'posted'
    ELSE 'forecast' END`

/** The two lookups STATUS_SQL reads, each by primary key, so they add no scan. */
export const STATUS_JOINS = `LEFT JOIN accounts a ON a.id = t.account_id AND a.owner = t.owner
    LEFT JOIN account_statements s
      ON s.owner = t.owner AND s.account_id = t.account_id AND s.year_month = t.budget_month`

/** Ids of the labels a row carries, one that no longer exists dropped as the dataset drops it. */
export const LABEL_IDS_SQL = `(SELECT json_group_array(tl.label_id)
      FROM transaction_labels tl JOIN labels l ON l.id = tl.label_id AND l.owner = t.owner
      WHERE tl.transaction_id = t.id)`

export const COLUMNS = `t.id, t.date, t.budget_month, t.description, t.account_id, t.category_id, t.type,
    t.amount_cents, t.cancelled, t.notes, t.created_at, t.plan_id, t.installment_index, t.flag_id,
    t.settled_by, t.report_count, t.report_covered_cents`

const ROW_SELECT = `SELECT ${COLUMNS}, ${STATUS_SQL} AS status, ${LABEL_IDS_SQL} AS label_ids
  FROM transactions t ${STATUS_JOINS}`

function term(sql: string, ...params: SqlParam[]): Sql {
  return { sql, params }
}

function period(f: TxnFilter): Sql[] {
  if (f.dateFrom || f.dateTo) {
    return [
      f.dateFrom ? term('t.date >= ?', f.dateFrom) : none,
      f.dateTo ? term('t.date <= ?', f.dateTo) : none,
    ]
  }
  return [f.month ? term('t.budget_month = ?', f.month) : none]
}

function dimensions(f: TxnFilter): Sql[] {
  const type = f.type && f.type !== 'all' ? f.type : undefined
  const status = f.status && f.status !== 'all' ? f.status : undefined
  return [
    f.categoryId != null ? term('t.category_id = ?', f.categoryId) : none,
    f.accountId != null ? term('t.account_id = ?', f.accountId) : none,
    type ? term('t.type = ?', type) : none,
    status ? term(`${STATUS_SQL} = ?`, status) : none,
    f.flagId === 'none' ? term('t.flag_id IS NULL') : none,
    typeof f.flagId === 'number' ? term('t.flag_id = ?', f.flagId) : none,
  ]
}

/** Any one of the labels (OR), through a single bound JSON list. */
function labels(f: TxnFilter, owner: string): Sql {
  if (!f.labelIds || f.labelIds.length === 0) return none
  return term(
    `t.id IN (SELECT tl.transaction_id FROM transaction_labels tl
       JOIN labels l ON l.id = tl.label_id AND l.owner = ?
       WHERE tl.label_id ${IN_ID_LIST})`,
    owner,
    idList(f.labelIds),
  )
}

function amounts(f: TxnFilter): Sql[] {
  return [
    f.amountMinCents != null ? term('abs(t.amount_cents) >= ?', f.amountMinCents) : none,
    f.amountMaxCents != null ? term('abs(t.amount_cents) <= ?', f.amountMaxCents) : none,
  ]
}

/**
 * Case-insensitive substring of "description notes" (joined by one space, so a search may span
 * them), or, when the search text also reads as an amount, a row whose amount is in that range.
 * `instr` rather than LIKE: `%` and `_` are plain characters to it, and D1's 50-byte cap on LIKE
 * patterns does not apply. SQLite's `lower` only knows ASCII, so each distinct non-ASCII letter of
 * the search text has its capital folded into the lower-case one first (see `caseFolds`).
 */
function text(f: TxnFilter): Sql {
  if (!f.query) return none
  const needle = f.query.toLowerCase()
  let haystack = `lower(t.description || ' ' || COALESCE(t.notes, ''))`
  const params: SqlParam[] = []
  for (const [upper, lower] of caseFolds(needle)) {
    haystack = `replace(${haystack}, ?, ?)`
    params.push(upper, lower)
  }
  params.push(needle)
  const match = `instr(${haystack}, ?) > 0`
  if (!f.queryAmount) return { sql: match, params }
  params.push(f.queryAmount.fromCents, f.queryAmount.toCents)
  return { sql: `(${match} OR abs(t.amount_cents) BETWEEN ? AND ?)`, params }
}

function allOf(parts: Sql[]): Sql {
  const used = parts.filter((p) => p.sql !== '')
  return { sql: used.map((p) => p.sql).join(AND), params: used.flatMap((p) => p.params) }
}

/** `WHERE` text and values for the owner and the filter; the keyset position, when given, goes last. */
function whereOf(owner: string, f: TxnFilter, after?: TransactionKey): Sql {
  const { sql, params } = allOf([
    term('t.owner = ?', owner),
    ...period(f),
    ...dimensions(f),
    labels(f, owner),
    ...amounts(f),
    text(f),
    after ? term('(t.date, t.id) < (?, ?)', after.date, after.id) : none,
  ])
  return { sql: `WHERE ${sql}`, params }
}

/** Only a status filter reads the account and statement; counting and summing skip the joins otherwise. */
function joinsFor(f: TxnFilter): string {
  return f.status && f.status !== 'all' ? STATUS_JOINS : ''
}

/** `limit + 1` rows, so the caller can tell whether another page exists. */
export function pageSql(owner: string, f: TxnFilter, limit: number, after?: TransactionKey): Sql {
  const where = whereOf(owner, f, after)
  return {
    sql: `${ROW_SELECT} ${where.sql} ORDER BY t.date DESC, t.id DESC LIMIT ?`,
    params: [...where.params, limit + 1],
  }
}

export function oneSql(owner: string, id: number): Sql {
  return { sql: `${ROW_SELECT} WHERE t.owner = ? AND t.id = ?`, params: [owner, id] }
}

/** Stops reading at one past the cap, so a broad filter costs the cap and not the table. */
export function countSql(owner: string, f: TxnFilter): Sql {
  const where = whereOf(owner, f)
  return {
    sql: `SELECT COUNT(*) AS n FROM (
      SELECT 1 FROM transactions t ${joinsFor(f)} ${where.sql} LIMIT ${SUMMARY_COUNT_CAP + 1})`,
    params: where.params,
  }
}

/** `netSpendCents` in the engine: expenses less refunds, income and investments left out. */
export function netSpendSql(owner: string, f: TxnFilter): Sql {
  const where = whereOf(owner, f)
  return {
    sql: `SELECT COALESCE(SUM(CASE t.type
        WHEN 'income' THEN 0 WHEN 'investment' THEN 0
        WHEN 'refund' THEN -t.amount_cents ELSE t.amount_cents END), 0) AS net
      FROM transactions t ${joinsFor(f)} ${where.sql}`,
    params: where.params,
  }
}
