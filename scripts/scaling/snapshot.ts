/**
 * A fingerprint of every row that does NOT belong to the synthetic owner: per table, the number of rows and
 * a SHA-256 over their contents in rowid order. Taken before a run and again after cleanup, equal
 * fingerprints show the run changed nothing else. The contents are hashed in memory and never printed or
 * written, because the development database may hold a copy of real data. Reading costs about one row read
 * per row in the database, twice.
 */
import { createHash } from 'node:crypto'
import { OWNER_TABLES } from './cleanup'
import { SYNTHETIC_OWNER } from './guard'
import type { SpendLedger } from './spend'
import type { Transport } from './transport'

export interface TableFingerprint {
  rows: number
  sha256: string
}

export type Fingerprint = Record<string, TableFingerprint>

const PAGE = 1000

interface Source {
  table: string
  /** FROM and WHERE for the rows of other owners, with the rowid of the table to page by as `r.rowid`. */
  from: string
}

function sources(): Source[] {
  const owned = OWNER_TABLES.map(({ table, column }) => ({
    table,
    from: `${table} r WHERE r.${column} <> ?1`,
  }))
  return [
    ...owned,
    {
      table: 'transaction_labels',
      from: 'transaction_labels r JOIN transactions t ON t.id = r.transaction_id WHERE t.owner <> ?1',
    },
    {
      table: 'wealth_checkin_entries',
      from: 'wealth_checkin_entries r JOIN wealth_checkins c ON c.id = r.checkin_id WHERE c.owner <> ?1',
    },
  ]
}

async function fingerprintTable(
  transport: Transport,
  ledger: SpendLedger,
  source: Source,
): Promise<TableFingerprint> {
  const hash = createHash('sha256')
  let rows = 0
  let after = 0
  for (;;) {
    const reply = await transport.query({
      sql: `SELECT r.rowid AS _rid, r.* FROM ${source.from} AND r.rowid > ?2 ORDER BY r.rowid LIMIT ${PAGE}`,
      params: [SYNTHETIC_OWNER, after],
    })
    ledger.record(reply.meta)
    if (reply.results.length === 0) break
    hash.update(JSON.stringify(reply.results))
    rows += reply.results.length
    after = Number(reply.results[reply.results.length - 1]?._rid)
  }
  return { rows, sha256: hash.digest('hex') }
}

export async function fingerprintOthers(transport: Transport, ledger: SpendLedger): Promise<Fingerprint> {
  const out: Fingerprint = {}
  for (const source of sources()) out[source.table] = await fingerprintTable(transport, ledger, source)
  return out
}

/** The tables whose rows differ between two fingerprints, with the row counts before and after. */
export function differences(before: Fingerprint, after: Fingerprint): string[] {
  return Object.keys({ ...before, ...after }).flatMap((table) => {
    const a = before[table]
    const b = after[table]
    if (a && b && a.sha256 === b.sha256 && a.rows === b.rows) return []
    return [`${table}: ${a?.rows ?? 'missing'} rows before, ${b?.rows ?? 'missing'} after`]
  })
}
