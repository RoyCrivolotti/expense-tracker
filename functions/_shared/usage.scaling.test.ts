/**
 * Measures what the usage counts cost as a ledger grows. Off by default, because it seeds up to a quarter
 * of a million rows:
 *
 *   SCALING_MEASURE=1 npx vitest run functions/_shared/usage.scaling.test.ts --reporter=verbose
 *   SCALING_ROWS=5000,20000 SCALING_MEASURE=1 npx vitest run functions/_shared/usage.scaling.test.ts --reporter=verbose
 *
 * Node numbers on this machine, against an in-memory SQLite. `server_js_ms` (the request minus the time
 * inside SQLite) is a stand-in for Worker CPU, not a measurement of it. `rows_read_min` is the owner's
 * transaction count: the statement reads each of them once. See docs/SCALING.md.
 */
import { describe, expect, it } from 'vitest'
import { seedDataset } from '../../src/testing/seedSqlite'
import { migratedDatabase, newStats, sqliteD1 } from '../../src/testing/sqliteD1'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'
import type { Env } from './env'

const OWNER = 'owner@example.com'
const MONTHS = 120
const SIZES = (process.env.SCALING_ROWS ?? '5000,20000,50000,100000,250000').split(',').map(Number)

const fixed = (n: number, digits = 1): number => Number(n.toFixed(digits))

async function measure(rows: number): Promise<Record<string, number>> {
  const ledger = syntheticLedger({ months: MONTHS, perMonth: Math.max(0, Math.round(rows / MONTHS) - 7) })
  const db = migratedDatabase()
  seedDataset(db, OWNER, ledger)
  const stats = newStats()
  const repo = createD1ExpenseRepository({ DB: sqliteD1(db, stats) } as Env)
  await repo.readUsage(OWNER)
  Object.assign(stats, newStats())
  const start = performance.now()
  const usage = await repo.readUsage(OWNER)
  const ms = performance.now() - start
  return {
    rows_read_min: ledger.transactions.length,
    categories: usage.categories.length,
    accounts: usage.accounts.length,
    queries: stats.statements,
    sqlite_ms: fixed(stats.sqliteMs),
    server_js_ms: fixed(ms - stats.sqliteMs),
    json_bytes: JSON.stringify(usage).length,
  }
}

describe.skipIf(!process.env.SCALING_MEASURE)('the usage counts, by ledger size', () => {
  it('prints cost per size', { timeout: 600_000 }, async () => {
    const results: Record<string, number>[] = []
    for (const rows of SIZES) results.push(await measure(rows))
    console.table(results)
    expect(results).toHaveLength(SIZES.length)
  })
})
