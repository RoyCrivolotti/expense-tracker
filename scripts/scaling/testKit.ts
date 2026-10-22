/**
 * Shared setup for the scaling tests: a migrated in-memory database that already holds another owner's
 * ledger, with ids that collide with a fresh synthetic seed's, the way a development database does.
 */
import type { DatabaseSync } from 'node:sqlite'
import { migratedDatabase } from '../../src/testing/sqliteD1'
import { seedDataset } from '../../src/testing/seedSqlite'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { CHUNK, readIdBases, seedSteps } from './seedSql'
import { ledgerOfAbout } from './ledgerSize'
import { runSeed } from './runSeed'
import { DEFAULT_LIMITS, SpendLedger, emptyTotals, type SpendLimits } from './spend'
import { fingerprintOthers, type Fingerprint } from './snapshot'
import { sqliteTransport, type RecordingTransport } from './sqliteTransport'

export const OTHER_OWNER = 'alex@example.com'
export const MONTH = '2026-10'

export function ledgerOf(limits: Partial<SpendLimits> = {}): SpendLedger {
  return new SpendLedger(emptyTotals('2026-10-19'), { read: 0, written: 0 }, { ...DEFAULT_LIMITS, ...limits })
}

/** A database with one real-looking owner whose ids start at 1, as a development database's do. */
export function databaseWithAnotherOwner(): DatabaseSync {
  const db = migratedDatabase()
  seedDataset(db, OTHER_OWNER, syntheticLedger({ months: 6, perMonth: 15, endMonth: MONTH, seed: 11 }))
  db.prepare("INSERT INTO allowed_users (email, status, granted_by) VALUES (?, 'active', 'test')").run(OTHER_OWNER)
  db.prepare('INSERT INTO owner_revision (owner, token) VALUES (?, ?)').run(OTHER_OWNER, 'abc')
  return db
}

export interface Seeded {
  db: DatabaseSync
  transport: RecordingTransport
  transactions: number
  /** What every row that is not the synthetic owner's looked like before the seed. */
  before: Fingerprint
}

/** Another owner's ledger plus a synthetic seed of about `size` transactions, sent through the real steps. */
export async function seededDatabase(size = 300): Promise<Seeded> {
  const db = databaseWithAnotherOwner()
  const transport = sqliteTransport(db)
  const before = await fingerprintOthers(transport, ledgerOf())
  const dataset = ledgerOfAbout(size, MONTH)
  const steps = seedSteps(dataset, await readIdBases(transport))
  await runSeed(transport, steps, ledgerOf())
  return { db, transport, transactions: dataset.transactions.length, before }
}

export { CHUNK }
