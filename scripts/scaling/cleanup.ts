/**
 * Removing everything a run wrote, and proving none is left. Every delete is owner-scoped and binds the
 * synthetic owner, so it can only ever match the run's own rows; `ownerRowCounts` then reads each table to
 * show it holds none. `schema.test.ts` fails when a migration adds a table this list does not know about.
 */
import { SYNTHETIC_OWNER } from './guard'
import type { SpendLedger } from './spend'
import type { Statement, Transport } from './transport'

export interface OwnerTable {
  table: string
  /** The column that names the owner. */
  column: 'owner' | 'email'
  /** Kept by triggers from another table and without a rowid, so a snapshot of the other owners' rows leaves it out. */
  derived?: true
}

/** Children before parents, so a foreign key never stops a delete. */
export const OWNER_TABLES: readonly OwnerTable[] = [
  { table: 'transactions', column: 'owner' },
  // Kept by triggers on transactions, so deleting the transactions empties them; listed so the proof reads them too.
  { table: 'ledger_cells', column: 'owner', derived: true },
  { table: 'ledger_months', column: 'owner', derived: true },
  { table: 'account_statements', column: 'owner' },
  { table: 'cash_actuals', column: 'owner' },
  { table: 'transaction_attachments', column: 'owner' },
  { table: 'installment_plans', column: 'owner' },
  { table: 'flags', column: 'owner' },
  { table: 'labels', column: 'owner' },
  { table: 'accounts', column: 'owner' },
  { table: 'categories', column: 'owner' },
  { table: 'settings', column: 'owner' },
  { table: 'goal_scenarios', column: 'owner' },
  { table: 'wealth_checkins', column: 'owner' },
  { table: 'wealth_accounts', column: 'owner' },
  { table: 'owner_revision', column: 'owner' },
  { table: 'access_requests', column: 'email' },
  { table: 'user_group_grants', column: 'email' },
  { table: 'allowed_users', column: 'email' },
]

/** Tables with no owner column, and why none is left behind by deleting the owner's rows. */
export const NOT_OWNER_SCOPED: Readonly<Record<string, string>> = {
  _migrations: 'the schema record, not data',
  transaction_labels: 'deleted with the transactions it links, in the same pass',
  wealth_checkin_entries: 'deleted by ON DELETE CASCADE from wealth_checkins',
}

/** Rows removed per statement. D1 caps how much one statement may change, and a small step bounds a mistake. */
export const DELETE_CHUNK = 500

const SCOPED = (column: string): string => `${column} = ?1`

/** One pass: the links of the next chunk of transactions, then those transactions. */
export function transactionChunk(): Statement[] {
  const ids = `SELECT id FROM transactions WHERE owner = ?1 ORDER BY id LIMIT ${DELETE_CHUNK}`
  return [
    { sql: `DELETE FROM transaction_labels WHERE transaction_id IN (${ids})`, params: [SYNTHETIC_OWNER] },
    { sql: `DELETE FROM transactions WHERE id IN (${ids})`, params: [SYNTHETIC_OWNER] },
  ]
}

/** The delete for every owner-scoped table other than transactions, in order. */
export function tableDeletes(): Statement[] {
  return OWNER_TABLES.filter((t) => t.table !== 'transactions').map(({ table, column }) => ({
    sql: `DELETE FROM ${table} WHERE ${SCOPED(column)}`,
    params: [SYNTHETIC_OWNER],
  }))
}

export interface CleanupResult {
  statements: number
  rowsWritten: number
}

/**
 * Deletes the synthetic owner's rows. Transactions go in chunks until a pass removes none; the rest
 * follow. Every reply goes through the ledger, so the cap stops it if deleting costs more than planned.
 */
export async function cleanUp(
  transport: Transport,
  ledger: SpendLedger,
  shouldStop: () => boolean = () => false,
): Promise<CleanupResult> {
  const result = { statements: 0, rowsWritten: 0 }
  const send = async (statement: Statement): Promise<number> => {
    if (shouldStop()) throw new Error('Stopped: the stop file is present')
    const reply = await transport.query(statement)
    ledger.record(reply.meta)
    result.statements += 1
    result.rowsWritten += reply.meta.rows_written ?? 0
    return reply.meta.changes ?? 0
  }
  for (;;) {
    const [links, rows] = transactionChunk() as [Statement, Statement]
    await send(links)
    if ((await send(rows)) === 0) break
  }
  for (const statement of tableDeletes()) await send(statement)
  return result
}

/** Rows each owner-scoped table still holds for the synthetic owner; every count should be zero. */
export async function ownerRowCounts(
  transport: Transport,
  ledger: SpendLedger,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const { table, column } of OWNER_TABLES) {
    const reply = await transport.query({
      sql: `SELECT count(*) AS n FROM ${table} WHERE ${SCOPED(column)}`,
      params: [SYNTHETIC_OWNER],
    })
    ledger.record(reply.meta)
    counts[table] = Number(reply.results[0]?.n ?? 0)
  }
  const links = await transport.query({
    sql:
      'SELECT count(*) AS n FROM transaction_labels l ' +
      'WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.id = l.transaction_id)',
    params: [],
  })
  ledger.record(links.meta)
  counts.transaction_labels_without_transaction = Number(links.results[0]?.n ?? 0)
  return counts
}
