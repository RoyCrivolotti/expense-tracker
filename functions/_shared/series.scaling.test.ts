/**
 * Measures what the series read costs as a ledger grows, beside the load it is meant to replace for the
 * recurring detectors. Off by default, because it seeds up to a quarter of a million rows:
 *
 *   SCALING_MEASURE=1 npx vitest run functions/_shared/series.scaling.test.ts
 *   SCALING_ROWS=5000,20000 SCALING_MEASURE=1 npx vitest run functions/_shared/series.scaling.test.ts
 *
 * Node numbers on this machine, against an in-memory SQLite. `server_js_ms` (the request minus the time
 * inside SQLite) is a stand-in for Worker CPU, not a measurement of it. `rows_read_min` is the number of
 * rows the statement has to visit at least once; D1 may bill index entries as well. See docs/SCALING.md.
 */
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  classifierFromGroups,
  classifyFixedSpend,
  recurringFixedGroups,
  recurringFixedGroupsFromSeries,
  type RecurringSeries,
} from '../../src/domain/engine'
import { seedDataset } from '../../src/testing/seedSqlite'
import { migratedDatabase, newStats, sqliteD1 } from '../../src/testing/sqliteD1'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'
import type { Env } from './env'

const OWNER = 'owner@example.com'
const MONTHS = 120
const SIZES = (process.env.SCALING_ROWS ?? '5000,20000,50000,100000,250000').split(',').map(Number)

const fixed = (n: number, digits = 1): number => Number(n.toFixed(digits))

/** Fastest of a few runs, in ms. */
function best<T>(fn: () => T, runs = 3): { ms: number; value: T } {
  let value = fn()
  let ms = Infinity
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now()
    value = fn()
    ms = Math.min(ms, performance.now() - start)
  }
  return { ms, value }
}

async function measure(rows: number): Promise<Record<string, number>> {
  const ledger = syntheticLedger({ months: MONTHS, perMonth: Math.max(0, Math.round(rows / MONTHS) - 7) })
  ledger.installmentPlans = []
  const db = migratedDatabase()
  seedDataset(db, OWNER, ledger)
  const stats = newStats()
  const repo = createD1ExpenseRepository({ DB: sqliteD1(db, stats) } as Env)

  await repo.readSeries(OWNER)
  Object.assign(stats, newStats())
  const start = performance.now()
  const series = await repo.readSeries(OWNER)
  const requestMs = performance.now() - start
  const served = { ...stats }

  const counted = (
    db.prepare("SELECT count(*) AS n FROM transactions WHERE owner = ? AND cancelled = 0 AND plan_id IS NULL AND description_norm > ''").get(OWNER) as { n: number }
  ).n
  const json = JSON.stringify({ series })
  const stringify = best(() => JSON.stringify({ series })).ms
  const parse = best(() => (JSON.parse(json) as { series: RecurringSeries[] }).series)
  const rebuild = best(() => classifierFromGroups(recurringFixedGroupsFromSeries(parse.value)))
  const fromRows = best(() => classifyFixedSpend(ledger.transactions))
  const gaps = series.reduce((sum, s) => sum + s.olderGaps.length, 0)

  return {
    rows: ledger.transactions.length,
    counted_rows: counted,
    series: series.length,
    older_gaps: gaps,
    queries: served.statements,
    sqlite_ms: fixed(served.sqliteMs),
    server_js_ms: fixed(requestMs - served.sqliteMs),
    stringify_ms: fixed(stringify),
    json_kb: fixed(json.length / 1_024),
    gzip_kb: fixed(gzipSync(json).length / 1_024),
    parse_ms: fixed(parse.ms),
    classifier_from_series_ms: fixed(rebuild.ms),
    classifier_from_rows_ms: fixed(fromRows.ms),
    recurring_groups_from_rows: recurringFixedGroups(ledger.transactions).length,
  }
}

describe.skipIf(!process.env.SCALING_MEASURE)('the series read, by ledger size', () => {
  it('prints cost per size', { timeout: 600_000 }, async () => {
    const results: Record<string, number>[] = []
    for (const rows of SIZES) results.push(await measure(rows))
    console.table(results)
    expect(results).toHaveLength(SIZES.length)
  })
})
