/**
 * Measures what the current "load everything" design costs as a ledger grows. Off by default, because it
 * seeds up to a quarter of a million rows:
 *
 *   SCALING_MEASURE=1 npx vitest run functions/_shared/loadDataset.scaling.test.ts
 *   SCALING_ROWS=5000,20000 SCALING_MEASURE=1 npx vitest run functions/_shared/loadDataset.scaling.test.ts
 *
 * These are Node numbers on this machine. `jsMs` (the load minus time inside SQLite) is a stand-in for Worker
 * CPU, not a measurement of it: workerd's meter, D1's rows-read billing and its 100 bound-parameter limit
 * can only be read on a deployed database. See docs/SCALING.md.
 */
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { buildTransactionListRows } from '../../src/domain/engine/transactionListRows'
import { computeCashReconciliation } from '../../src/domain/engine/cashReconciliation'
import { groupTransactions } from '../../src/domain/engine/recurringDetect'
import { buildExpenseModel } from '../../src/ui/buildExpenseModel'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import type { ExpenseDataset } from '../../src/domain/types'
import { loadDataset } from './db'
import type { Env } from './env'
import { migratedDatabase, newStats, sqliteD1 } from '../../src/testing/sqliteD1'
import { seedDataset } from '../../src/testing/seedSqlite'

const OWNER = 'owner@example.com'
const MONTHS = 120
const SIZES = (process.env.SCALING_ROWS ?? '5000,20000,50000,100000,250000').split(',').map(Number)

/** Fastest of a few runs, in ms, so one slow GC pause does not stand for the cost. */
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

const fixed = (n: number, digits = 1): number => Number(n.toFixed(digits))

function shapeFor(rows: number): { months: number; perMonth: number } {
  return { months: MONTHS, perMonth: Math.max(0, Math.round(rows / MONTHS) - 7) }
}

const TXN_COLUMNS =
  'id,date,budget_month,description,account_id,category_id,type,amount_cents,cancelled,notes,created_at,plan_id,installment_index,flag_id,settled_by,report_count,report_covered_cents'

/**
 * The transactions read with no mapping and no status derivation on the server: raw column tuples straight
 * to JSON. What a "compact" route could cost; the client would derive status from accounts and statements.
 */
async function compactRead(env: Env, stats: ReturnType<typeof newStats>): Promise<{ jsMs: number; mb: number }> {
  const sqliteBefore = stats.sqliteMs
  const start = performance.now()
  const tuples = await env.DB.prepare(`SELECT ${TXN_COLUMNS} FROM transactions WHERE owner = ? ORDER BY date DESC, id DESC`)
    .bind(OWNER)
    .raw()
  const body = JSON.stringify(tuples)
  const total = performance.now() - start
  return { jsMs: total - (stats.sqliteMs - sqliteBefore), mb: body.length / 1_048_576 }
}

async function measure(rows: number): Promise<Record<string, number>> {
  const ledger: ExpenseDataset = syntheticLedger(shapeFor(rows))
  ledger.installmentPlans = []
  const db = migratedDatabase()
  seedDataset(db, OWNER, ledger)
  const stats = newStats()
  const env = { DB: sqliteD1(db, stats) } as Env

  await loadDataset(env, OWNER)
  Object.assign(stats, newStats())
  const start = performance.now()
  const loaded = await loadDataset(env, OWNER)
  const loadMs = performance.now() - start
  const load = { ...stats }

  const compact = await compactRead(env, stats)
  const heapBefore = process.memoryUsage().heapUsed
  const json = JSON.stringify(loaded)
  const stringifyMs = best(() => JSON.stringify(loaded)).ms
  const gzipBytes = gzipSync(json).length
  const parsed = best(() => JSON.parse(json) as ExpenseDataset)
  const clone = best(() => structuredClone(parsed.value))
  const model = best(() => buildExpenseModel(parsed.value))
  const data = parsed.value
  const cash = best(() => computeCashReconciliation(data.transactions, data.accounts, data.settings, data.cashActuals))
  const all = best(() => buildTransactionListRows(data.transactions, {}, data.accountStatements, cash.value, data.accounts, data.settings))
  const series = best(() => groupTransactions(data.transactions))
  const heapMb = (process.memoryUsage().heapUsed - heapBefore) / 1_048_576

  return {
    rows: loaded.transactions.length,
    server_load_ms: fixed(loadMs),
    server_js_ms: fixed(loadMs - load.sqliteMs),
    sqlite_ms: fixed(load.sqliteMs),
    queries: load.statements,
    rows_returned: load.rowsReturned,
    compact_js_ms: fixed(compact.jsMs),
    compact_mb: fixed(compact.mb),
    json_mb: fixed(json.length / 1_048_576),
    gzip_mb: fixed(gzipBytes / 1_048_576),
    stringify_ms: fixed(stringifyMs),
    parse_ms: fixed(parsed.ms),
    clone_ms: fixed(clone.ms),
    model_ms: fixed(model.ms),
    cash_ms: fixed(cash.ms),
    all_list_ms: fixed(all.ms),
    list_rows: all.value.length,
    recurring_groups_ms: fixed(series.ms),
    heap_mb: fixed(heapMb, 0),
  }
}

describe.skipIf(!process.env.SCALING_MEASURE)('current load path, by ledger size', () => {
  it('prints cost per size', { timeout: 600_000 }, async () => {
    const results: Record<string, number>[] = []
    for (const rows of SIZES) results.push(await measure(rows))
    console.table(results)
    expect(results).toHaveLength(SIZES.length)
  })
})
