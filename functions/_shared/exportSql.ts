/**
 * The statements of the export, one keyset read per table. Every one is owner-scoped from the caller,
 * orders by the table's primary key so the rows come off its index with no sort, reads one row past the
 * limit to tell whether another chunk follows, and binds a fixed handful of values.
 */
import { statementPosition, type ExportTable } from '../domain/data/exportTables'
import { COLUMNS, LABEL_IDS_SQL, STATUS_JOINS, STATUS_SQL, type Sql, type SqlParam } from './transactionQuerySql'
import { IN_ID_LIST } from './sqlIdList'

interface Keyed {
  table: string
  /** Key columns in order; `after` is compared with them as a row value. */
  key: string
}

const BY_ID: Partial<Record<ExportTable, string>> = {
  categories: 'categories',
  accounts: 'accounts',
  labels: 'labels',
  flags: 'flags',
  goalScenarios: 'goal_scenarios',
  installmentPlans: 'installment_plans',
  wealthAccounts: 'wealth_accounts',
  wealthCheckins: 'wealth_checkins',
  attachments: 'transaction_attachments',
}

const TRANSACTIONS = `SELECT ${COLUMNS}, ${STATUS_SQL} AS status, ${LABEL_IDS_SQL} AS label_ids
  FROM transactions t ${STATUS_JOINS}
  WHERE t.owner = ? AND t.id > ? ORDER BY t.id LIMIT ?`

function keyed({ table, key }: Keyed, owner: string, after: SqlParam[], limit: number): Sql {
  const columns = key.split(', ')
  const position =
    after.length === 0
      ? ''
      : columns.length === 1
        ? ` AND ${key} > ?`
        : ` AND (${key}) > (${columns.map(() => '?').join(', ')})`
  return {
    sql: `SELECT * FROM ${table} WHERE owner = ?${position} ORDER BY ${key} LIMIT ?`,
    params: [owner, ...after, limit + 1],
  }
}

/** The read for one chunk of `table`; `after` is the cursor of the chunk before it, already checked. */
export function exportSql(table: ExportTable, owner: string, after: string | undefined, limit: number): Sql {
  if (table === 'transactions') return { sql: TRANSACTIONS, params: [owner, after === undefined ? 0 : Number(after), limit + 1] }
  if (table === 'settings') return { sql: 'SELECT * FROM settings WHERE owner = ?', params: [owner] }
  if (table === 'cashActuals') {
    return keyed({ table: 'cash_actuals', key: 'year_month' }, owner, after === undefined ? [] : [after], limit)
  }
  if (table === 'accountStatements') {
    const position = after === undefined ? undefined : statementPosition(after)
    return keyed(
      { table: 'account_statements', key: 'account_id, year_month' },
      owner,
      position ? [position.accountId, position.yearMonth] : [],
      limit,
    )
  }
  const name = BY_ID[table]!
  return keyed({ table: name, key: 'id' }, owner, after === undefined ? [] : [Number(after)], limit)
}

/** The entries of the check-ins in a chunk, in one read, for the owner's check-ins only. */
export const CHECKIN_ENTRIES_SQL = `SELECT e.* FROM wealth_checkin_entries e
  JOIN wealth_checkins c ON c.id = e.checkin_id
  WHERE c.owner = ? AND e.checkin_id ${IN_ID_LIST} ORDER BY e.checkin_id, e.id`
