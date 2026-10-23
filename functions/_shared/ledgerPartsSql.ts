/**
 * SQL for the ledger parts (docs/API.md). As in `transactionQuerySql.ts`, every
 * statement is built here, every value is bound, and the owner is the first predicate of each one and
 * the only thing that scopes it. Nothing here binds more than a handful of values whatever the data
 * holds (D1 allows 100): an id list is a subquery, never a bound list.
 *
 * "Pinned" is `isPinned` in `src/domain/ledger/pinned.ts`; `PINNED_SQL` and `UNPINNED_SQL` say the same
 * thing about a row's own columns, and a test holds them to it. Whether a row is the target of another
 * row's `settled_by` is a lookup in the same table, so it sits beside them in `PAYMENT_SQL`.
 */
import type { MonthRange } from '../domain/data/ledgerParts'
import {
  COLUMNS,
  LABEL_IDS_SQL,
  STATUS_JOINS,
  STATUS_SQL,
  type Sql,
} from './transactionQuerySql'

/**
 * Must stay the predicate of `idx_txn_pinned` (migration 0037), word for word, or SQLite stops reading
 * pinned rows through it and reads the owner's whole ledger instead.
 */
export const PINNED_SQL = `(t.type = 'investment' OR t.plan_id IS NOT NULL OR t.flag_id IS NOT NULL
      OR t.settled_by IS NOT NULL OR t.report_count > 0)`

/** The complement of {@link PINNED_SQL}, written out so a NULL `report_count` cannot hide a row. */
export const UNPINNED_SQL = `(t.type <> 'investment' AND t.plan_id IS NULL AND t.flag_id IS NULL
      AND t.settled_by IS NULL AND COALESCE(t.report_count, 0) <= 0)`

/** A row some other row was settled by. One lookup on `idx_txn_settled_by`, however many rows there are. */
const PAYMENT_SQL = `t.id IN (SELECT settled_by FROM transactions WHERE owner = ? AND settled_by IS NOT NULL)`

/** Receipts a row has; 0 for most rows, and one probe of `idx_attachments_txn` each. */
const RECEIPTS_SQL = `(SELECT COUNT(*) FROM transaction_attachments r
      WHERE r.owner = t.owner AND r.transaction_id = t.id)`

const ROW_COLUMNS = `${COLUMNS}, ${STATUS_SQL} AS status, ${LABEL_IDS_SQL} AS label_ids,
    ${RECEIPTS_SQL} AS receipts`

/**
 * The pinned rows that `idx_txn_pinned` holds, newest first. The index is keyed on the date, so the
 * rows come off it in order with no sort.
 */
export function pinnedSql(owner: string): Sql {
  return {
    sql: `SELECT ${ROW_COLUMNS} FROM transactions t ${STATUS_JOINS}
      WHERE t.owner = ? AND ${PINNED_SQL}
      ORDER BY t.date DESC, t.id DESC`,
    params: [owner],
  }
}

/**
 * The pinned rows the index does not hold: payments that are pinned only because another row points
 * at them (a refund recorded before the covered count was kept). Few, and unordered, so a statement of
 * their own: ordering it together with the first lets SQLite walk the whole date index to merge.
 */
export function paymentsSql(owner: string): Sql {
  return {
    sql: `SELECT ${ROW_COLUMNS} FROM transactions t ${STATUS_JOINS}
      WHERE t.owner = ? AND ${PAYMENT_SQL} AND ${UNPINNED_SQL}`,
    params: [owner, owner],
  }
}

/**
 * Rows in the range, in the order `idx_txn_owner_month_date` holds them read backwards: the newest budget month
 * first and, inside a month, the newest row first. Nothing is sorted or joined in here, so the statement visits
 * about one row per row returned, and `LIMIT` stops it after `maxRows + 1` index entries: a caller that gets more
 * than `maxRows` back knows the range is too big, and that costs the bound and not the range. The caller puts the
 * months in the order the API returns rows and derives each status from {@link accountsSql} and
 * {@link paidStatementsSql}, which is why this statement selects no `status`.
 */
export function monthRowsSql(owner: string, range: MonthRange, maxRows: number): Sql {
  return {
    sql: `SELECT ${COLUMNS}, ${LABEL_IDS_SQL} AS label_ids, ${RECEIPTS_SQL} AS receipts
      FROM transactions t
      WHERE t.owner = ? AND t.budget_month >= ? AND t.budget_month <= ?
      ORDER BY t.budget_month DESC, t.date DESC, t.id DESC
      LIMIT ?`,
    params: [owner, range.from, range.to, maxRows + 1],
  }
}

/** The owner's accounts, which say whether a row's status looks at a statement at all. A handful of rows. */
export function accountsSql(owner: string): Sql {
  return { sql: 'SELECT * FROM accounts WHERE owner = ?', params: [owner] }
}

/**
 * The statements marked paid for the months of the range. Only a paid statement changes a status, so the
 * rest are not read. Listing the owner's accounts first lets SQLite seek the months inside each account's
 * statements and not walk all of them, since the key is `(owner, account_id, year_month)`.
 */
export function paidStatementsSql(owner: string, range: MonthRange): Sql {
  return {
    sql: `SELECT * FROM account_statements
      WHERE owner = ? AND paid = 1 AND year_month >= ? AND year_month <= ?
        AND account_id IN (SELECT id FROM accounts WHERE owner = ?)`,
    params: [owner, range.from, range.to, owner],
  }
}

/**
 * One row per (month, account, category, type, cancelled, sign of amount) of the unpinned rows in the
 * range, in the order `buildCells` returns them. `maxCells + 1` groups at most, so the caller can tell
 * the range holds too many.
 */
export function cubeSql(owner: string, range: MonthRange, maxCells: number): Sql {
  return {
    sql: `SELECT t.budget_month, t.account_id, t.category_id, t.type, t.cancelled,
        CASE WHEN t.amount_cents > 0 THEN 1 WHEN t.amount_cents < 0 THEN -1 ELSE 0 END AS sign,
        SUM(t.amount_cents) AS amount_cents, COUNT(*) AS n
      FROM transactions t
      WHERE t.owner = ? AND t.budget_month >= ? AND t.budget_month <= ?
        AND ${UNPINNED_SQL} AND NOT (${PAYMENT_SQL})
      GROUP BY t.budget_month, t.account_id, t.category_id, t.type, t.cancelled, sign
      ORDER BY t.budget_month, t.account_id, t.category_id, t.type, t.cancelled, sign
      LIMIT ?`,
    params: [owner, range.from, range.to, owner, maxCells + 1],
  }
}

/**
 * Rows per budget month, for every month with any row. Reads index entries only (the budget month is
 * in `idx_txn_owner_month_date`), but D1 counts each entry as a row read.
 */
export function monthCountsSql(owner: string): Sql {
  return {
    sql: `SELECT budget_month, COUNT(*) AS n FROM transactions
      WHERE owner = ? GROUP BY budget_month ORDER BY budget_month`,
    params: [owner],
  }
}
