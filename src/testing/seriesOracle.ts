/**
 * An independent implementation of `GET /series`, for the differential test to hold the route to: the
 * whole answer worked out inside SQLite with window functions (rank within a series, gap to the row
 * before) and a group by, one result row per series. It reads about seven rows per transaction where the
 * route's statement reads one, which is why the route does not run it. The route and this must agree on
 * every ledger.
 */
import type { DatabaseSync } from 'node:sqlite'
import { SERIES_TAIL_DATES, SERIES_TAIL_OFFSETS, type RecurringSeries } from '../domain/engine/recurringSeries'

interface OracleRow {
  account_id: number
  category_id: number
  type: 'expense' | 'income' | 'investment' | 'refund'
  label: string
  amount_cents: number
  newest_dates: string
  older_gaps: string | null
  budget_months: string
  offsets: string
}

const KEY = 'description_norm, account_id, category_id, type'

/** ?1 owner, ?2 how many newest dates a series keeps, ?3 how many newest offsets. */
export const ORACLE_SERIES_SQL = `
WITH counted AS (
  SELECT ${KEY}, date, id, budget_month, description, amount_cents,
         row_number() OVER newest AS age,
         CAST(julianday(date) - julianday(lag(date) OVER oldest) AS INTEGER) AS gap,
         (CAST(substr(budget_month, 1, 4) AS INTEGER) * 12 + CAST(substr(budget_month, 6, 2) AS INTEGER))
           - (CAST(substr(date, 1, 4) AS INTEGER) * 12 + CAST(substr(date, 6, 2) AS INTEGER)) AS months_ahead
  FROM transactions
  WHERE owner = ?1 AND cancelled = 0 AND plan_id IS NULL AND description_norm > ''
  WINDOW newest AS (PARTITION BY ${KEY} ORDER BY date DESC, id DESC),
         oldest AS (PARTITION BY ${KEY} ORDER BY date, id)
)
SELECT account_id, category_id, type,
       max(CASE WHEN age = 1 THEN description END) AS label,
       max(CASE WHEN age = 1 THEN amount_cents END) AS amount_cents,
       max(CASE WHEN age = 1 THEN date END) AS newest_date,
       max(CASE WHEN age = 1 THEN id END) AS newest_id,
       group_concat(CASE WHEN age <= ?2 THEN date END) AS newest_dates,
       group_concat(CASE WHEN age >= ?2 THEN gap END) AS older_gaps,
       group_concat(DISTINCT budget_month) AS budget_months,
       group_concat(CASE WHEN age <= ?3 THEN months_ahead END) AS offsets
FROM counted
GROUP BY ${KEY}
HAVING count(*) >= 3
ORDER BY newest_date DESC, newest_id DESC`

function numbers(csv: string | null): number[] {
  if (!csv) return []
  return csv.split(',').map(Number).sort((a, b) => a - b)
}

export function oracleSeries(db: DatabaseSync, owner: string): RecurringSeries[] {
  const rows = db.prepare(ORACLE_SERIES_SQL).all(owner, SERIES_TAIL_DATES, SERIES_TAIL_OFFSETS) as unknown as OracleRow[]
  return rows.map((row) => ({
    label: row.label,
    accountId: row.account_id,
    categoryId: row.category_id,
    type: row.type,
    amountCents: row.amount_cents,
    newestDates: row.newest_dates.split(',').sort(),
    olderGaps: numbers(row.older_gaps),
    budgetMonths: row.budget_months.split(',').sort(),
    budgetOffsets: numbers(row.offsets),
  }))
}
