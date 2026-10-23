// @vitest-environment node
/**
 * Measures what the ledger parts cost as a ledger grows, to set the limits on a rows request and a cube
 * request and to check that a bigger ledger does not make the reference part bigger than its pinned rows.
 * Off by default, because it seeds up to a quarter of a million rows:
 *
 *   SCALING_MEASURE=1 npx vitest run functions/_shared/ledgerParts.scaling.test.ts
 *   SCALING_ROWS=5000,20000 SCALING_MEASURE=1 npx vitest run functions/_shared/ledgerParts.scaling.test.ts
 *
 * These are Node numbers on this machine. `jsMs` (the read, plus turning it into JSON, minus time inside
 * SQLite) is a stand-in for Worker CPU, not a measurement of it: workerd's meter, what D1 spends on the
 * statement itself, and D1's rows-read billing can only be read on a deployed database. The row mapping
 * is run three ways on the same rows to show whether raw column tuples are worth their awkwardness.
 */
import { describe, expect, it } from 'vitest'
import type { Transaction } from '../../src/domain/types'
import { migratedDatabase, newStats, sqliteD1 } from '../../src/testing/sqliteD1'
import { seedDataset } from '../../src/testing/seedSqlite'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'
import type { Env } from './env'
import { monthRowsSql } from './ledgerPartsSql'
import { toStoredTxn, type TxnRow } from './rows'

const OWNER = 'owner@example.com'
const MONTHS = 120
const SIZES = (process.env.SCALING_ROWS ?? '5000,20000,50000,100000,250000').split(',').map(Number)
const ROW_COUNTS = [500, 1_000, 2_000, 3_000, 5_000, 8_000, 10_000]

const fixed = (n: number, digits = 1): number => Number(n.toFixed(digits))

/** Fastest of a few runs, in ms, so one slow GC pause does not stand for the cost. */
async function best<T>(fn: () => Promise<T>, runs = 5): Promise<{ ms: number; value: T }> {
  let value = await fn()
  let ms = Infinity
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now()
    value = await fn()
    ms = Math.min(ms, performance.now() - start)
  }
  return { ms, value }
}

function shapeFor(rows: number): { months: number; perMonth: number } {
  return { months: MONTHS, perMonth: Math.max(0, Math.round(rows / MONTHS) - 7) }
}

function database(rows: number) {
  const ledger = syntheticLedger(shapeFor(rows))
  ledger.installmentPlans = []
  const db = migratedDatabase()
  seedDataset(db, OWNER, ledger)
  const stats = newStats()
  const env = { DB: sqliteD1(db, stats) } as Env
  return { db, stats, env, repo: createD1ExpenseRepository(env) }
}

/** Time spent in JavaScript for one call: wall time less what SQLite itself took. */
async function jsTime<T>(stats: ReturnType<typeof newStats>, fn: () => Promise<T>): Promise<{ jsMs: number; value: T }> {
  const sqliteBefore = stats.sqliteMs
  const start = performance.now()
  const value = await fn()
  return { jsMs: performance.now() - start - (stats.sqliteMs - sqliteBefore), value }
}

async function measureReference(rows: number): Promise<Record<string, number>> {
  const { repo, stats } = database(rows)
  await repo.readLedgerReference(OWNER)
  const run = await best(() => jsTime(stats, async () => JSON.stringify(await repo.readLedgerReference(OWNER))))
  const part = await repo.readLedgerReference(OWNER)
  return {
    rows: part.rowCount,
    pinned: part.pinned.length,
    months: part.months.length,
    reference_js_ms: fixed(run.value.jsMs),
    json_kb: fixed(run.value.value.length / 1024),
  }
}

type Row = TxnRow & { label_ids: string; receipts: number }

/** The mapping as `readMonthRows` does it: `toStoredTxn`, then a spread for the status and the labels. The status is a stand-in; the read derives it per row. */
function viaObjects(rows: Row[]): Transaction[] {
  return rows.map((r) => ({
    ...toStoredTxn(r),
    status: 'posted' as const,
    labelIds: r.label_ids === '[]' ? [] : (JSON.parse(r.label_ids) as number[]).sort((a, b) => a - b),
  }))
}

/** One object built directly from the row, no intermediate one. */
function direct(rows: Row[]): Transaction[] {
  return rows.map((r) => {
    const t: Transaction = {
      id: r.id, date: r.date, budgetMonth: r.budget_month, description: r.description, accountId: r.account_id,
      categoryId: r.category_id, type: r.type, amountCents: r.amount_cents, cancelled: r.cancelled === 1,
      status: 'posted',
      labelIds: r.label_ids === '[]' ? [] : (JSON.parse(r.label_ids) as number[]).sort((a, b) => a - b),
    }
    if (r.notes) t.notes = r.notes
    if (r.created_at) t.createdAt = r.created_at
    if (r.plan_id != null) t.planId = r.plan_id
    if (r.installment_index != null) t.installmentIndex = r.installment_index
    if (r.flag_id != null) t.flagId = r.flag_id
    if (r.settled_by != null) t.settledBy = r.settled_by
    if (r.report_count != null) t.reportCount = r.report_count
    if (r.report_covered_cents != null) t.reportCoveredCents = r.report_covered_cents
    return t
  })
}

/** The same from `raw()` tuples in column order, which skips naming every column per row. */
function fromTuples(rows: unknown[][]): Transaction[] {
  return rows.map((r) => {
    const t: Transaction = {
      id: r[0] as number, date: r[1] as string, budgetMonth: r[2] as string, description: r[3] as string,
      accountId: r[4] as number, categoryId: r[5] as number, type: r[6] as Transaction['type'],
      amountCents: r[7] as number, cancelled: r[8] === 1, status: 'posted',
      labelIds: r[17] === '[]' ? [] : (JSON.parse(r[17] as string) as number[]).sort((a, b) => a - b),
    }
    if (r[9]) t.notes = r[9] as string
    if (r[10]) t.createdAt = r[10] as string
    if (r[11] != null) t.planId = r[11] as number
    if (r[12] != null) t.installmentIndex = r[12] as number
    if (r[13] != null) t.flagId = r[13] as number
    if (r[14] != null) t.settledBy = r[14] as number
    if (r[15] != null) t.reportCount = r[15] as number
    if (r[16] != null) t.reportCoveredCents = r[16] as number
    return t
  })
}

/**
 * The rows come out of node:sqlite as objects whose property reads are slower than a plain object's, and
 * workerd hands a Worker plain objects and arrays parsed from JSON. So the rows are copied through JSON
 * first, and only the mapping and the stringify are timed.
 */
async function measureRows(env: Env, count: number): Promise<Record<string, number>> {
  const { sql, params } = monthRowsSql(OWNER, { from: '2000-01', to: '2099-12' }, count)
  const statement = () => env.DB.prepare(sql).bind(...params.slice(0, -1), count)
  const asObjects = JSON.parse(JSON.stringify((await statement().all<Row>()).results)) as Row[]
  const asTuples = JSON.parse(JSON.stringify(await statement().raw())) as unknown[][]
  const time = async (map: () => Transaction[]) => best(async () => {
    const start = performance.now()
    JSON.stringify(map())
    return performance.now() - start
  })
  const objects = await time(() => viaObjects(asObjects))
  const built = await time(() => direct(asObjects))
  const tuples = await time(() => fromTuples(asTuples))
  return {
    rows: count,
    via_toStoredTxn_ms: fixed(objects.value),
    direct_ms: fixed(built.value),
    raw_tuples_ms: fixed(tuples.value),
    json_kb: fixed(JSON.stringify(viaObjects(asObjects)).length / 1024),
    objects_kb: fixed(JSON.stringify(asObjects).length / 1024),
    tuples_kb: fixed(JSON.stringify(asTuples).length / 1024),
  }
}

async function measureCube(repo: ReturnType<typeof createD1ExpenseRepository>, stats: ReturnType<typeof newStats>, months: number) {
  const to = '2026-09'
  const [y, m] = to.split('-').map(Number) as [number, number]
  const index = y * 12 + (m - 1) - (months - 1)
  const from = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
  const range = { from, to }
  await repo.readMonthCells(OWNER, range, 1_000_000)
  const run = await best(() => jsTime(stats, async () => JSON.stringify(await repo.readMonthCells(OWNER, range, 1_000_000))))
  const cells = (await repo.readMonthCells(OWNER, range, 1_000_000)) ?? []
  const sqlite = await best(async () => {
    const before = stats.sqliteMs
    await repo.readMonthCells(OWNER, range, 1_000_000)
    return stats.sqliteMs - before
  })
  return {
    months,
    cells: cells.length,
    rows_summed: cells.reduce((n, c) => n + c.count, 0),
    cube_js_ms: fixed(run.value.jsMs),
    cube_sqlite_ms: fixed(sqlite.value),
    json_kb: fixed(run.value.value.length / 1024),
  }
}

describe.skipIf(!process.env.SCALING_MEASURE)('ledger parts, by ledger size', () => {
  it('reference part', { timeout: 600_000 }, async () => {
    const results: Record<string, number>[] = []
    for (const rows of SIZES) results.push(await measureReference(rows))
    console.table(results)
    expect(results).toHaveLength(SIZES.length)
  })

  it('rows of a range, by number of rows', { timeout: 600_000 }, async () => {
    const { env } = database(Math.max(...ROW_COUNTS) * 2)
    const results: Record<string, number>[] = []
    for (const count of ROW_COUNTS) results.push(await measureRows(env, count))
    console.table(results)
    expect(results).toHaveLength(ROW_COUNTS.length)
  })

  it('cube, by number of months', { timeout: 600_000 }, async () => {
    const { repo, stats } = database(Math.min(...SIZES.slice(-2)))
    const results = []
    for (const months of [12, 24, 60, 120]) results.push(await measureCube(repo, stats, months))
    console.table(results)
    expect(results).toHaveLength(4)
  })
})
