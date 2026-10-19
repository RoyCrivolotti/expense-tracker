/**
 * Measures what a suggestion costs as a ledger grows. Off by default, because it seeds up to a quarter of
 * a million rows:
 *
 *   SCALING_MEASURE=1 npx vitest run functions/_shared/descriptionSuggest.scaling.test.ts --reporter=verbose
 *   SCALING_ROWS=5000,20000 SCALING_MEASURE=1 npx vitest run functions/_shared/descriptionSuggest.scaling.test.ts --reporter=verbose
 *
 * Node numbers on this machine, against an in-memory SQLite. `server_js_ms` (the request minus the time
 * inside SQLite) is a stand-in for Worker CPU, not a measurement of it. `rows_in_range` counts the eligible
 * rows of the prefix, which the statement does not read one by one: it reads an index entry per description
 * and then the rows of each from the newest down to an eligible one. See docs/SCALING.md.
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
const PREFIXES = ['c', 'co', 'cor', 'corner market 1', 'zz']

const fixed = (n: number, digits = 1): number => Number(n.toFixed(digits))

async function measure(rows: number): Promise<Array<Record<string, number | string>>> {
  const ledger = syntheticLedger({ months: MONTHS, perMonth: Math.max(0, Math.round(rows / MONTHS) - 7) })
  ledger.installmentPlans = []
  const db = migratedDatabase()
  seedDataset(db, OWNER, ledger)
  const stats = newStats()
  const repo = createD1ExpenseRepository({ DB: sqliteD1(db, stats) } as Env)
  const out: Array<Record<string, number | string>> = []
  for (const prefix of PREFIXES) {
    const request = { prefix, limit: 8, before: '2026-01' }
    await repo.suggestDescriptions(OWNER, request)
    Object.assign(stats, newStats())
    const start = performance.now()
    const { items } = await repo.suggestDescriptions(OWNER, request)
    const ms = performance.now() - start
    const inRange = db
      .prepare("SELECT count(*) AS n, count(DISTINCT description_norm) AS keys FROM transactions WHERE owner = ? AND description_norm >= ? AND description_norm < ? AND cancelled = 0 AND budget_month < '2026-01'")
      .get(OWNER, prefix, prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1)) as { n: number; keys: number }
    out.push({
      rows: ledger.transactions.length,
      prefix,
      rows_in_range: inRange.n,
      keys: inRange.keys,
      returned: items.length,
      queries: stats.statements,
      sqlite_ms: fixed(stats.sqliteMs),
      server_js_ms: fixed(ms - stats.sqliteMs),
    })
  }
  return out
}

describe.skipIf(!process.env.SCALING_MEASURE)('a suggestion, by ledger size', () => {
  it('prints cost per size', { timeout: 600_000 }, async () => {
    const results: Array<Record<string, number | string>> = []
    for (const rows of SIZES) results.push(...(await measure(rows)))
    console.table(results)
    expect(results.length).toBe(SIZES.length * PREFIXES.length)
  })
})
