// @vitest-environment node
/**
 * The ledger rollup (migration 0039) against an oracle that never reads it. Every write path of the API runs
 * on SQLite with the real migrations, and after each write the cells equal a fresh GROUP BY, the months equal the
 * per-month counts, no count is negative, and the cube read from the cells equals `cubeSql` and `buildCells`.
 * docs/decisions/ledger-rollup.md says why the rollup is built this way.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { splitStatements } from '../../../scripts/sql-statements.mjs'
import { applyMigrationSql, migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { assertRollup } from '../../_shared/testing/rollupKit'
import { newKit } from '../../_shared/testing/rollupWorld'
import { OWNER } from '../../_shared/testing/expenseWorld'
import { emptySmallestMonth, make, pinningScenarios } from '../../_shared/testing/rollupScenarios'
import { shapeScenarios } from '../../_shared/testing/rollupScenariosShape'
import { seedRows, walk } from '../../_shared/testing/rollupWalk'

afterEach(() => vi.useRealTimers())

const MIGRATION = readFileSync(join(import.meta.dirname, '..', '..', '..', 'migrations', '0039_ledger_rollup.sql'), 'utf8')
const STATEMENTS: Array<{ sql: string }> = splitStatements(MIGRATION)
/** The statements after the last trigger fill the tables; they are told apart by where they are, not by what they say. */
const FIRST_BACKFILL = STATEMENTS.findLastIndex((s) => /^CREATE TRIGGER/i.test(s.sql)) + 1
const SETUP = STATEMENTS.slice(0, FIRST_BACKFILL)
const BACKFILLS = STATEMENTS.slice(FIRST_BACKFILL)

async function kitFor(seed: number, through?: string) {
  const sqlite = migratedDatabase(through)
  return { sqlite, k: await newKit(sqlite, sqliteD1(sqlite, newStats()), seed) }
}

describe('named hazards', () => {
  for (const scenario of [...pinningScenarios, ...shapeScenarios]) {
    it(scenario.name, async () => scenario.run((await kitFor(1)).k))
  }
})

describe('a random walk over every write path', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('seed %i', async (seed) => {
    const { k } = await kitFor(seed)
    await seedRows(k, 15)
    await walk(k, 250)
  }, 120_000)
})

describe('the migration', () => {
  it('fills the tables over a ledger that already exists, then keeps them exact', async () => {
    const { sqlite, k } = await kitFor(31, '0038')
    await seedRows(k, 25)
    await walk(k, 150, false)
    applyMigrationSql(sqlite, MIGRATION)
    await assertRollup(k, 'the backfill')
    await walk(k, 60)
  }, 120_000)

  it('counts a write made after the triggers exist and before the backfill runs', async () => {
    const { sqlite, k } = await kitFor(32, '0038')
    await seedRows(k, 20)
    await walk(k, 60, false)
    for (const statement of SETUP) sqlite.exec(statement.sql)
    await walk(k, 60, false)
    await emptySmallestMonth(k, OWNER)
    for (const statement of BACKFILLS) sqlite.exec(statement.sql)
    await assertRollup(k, 'the backfill after writes')
    await walk(k, 40)
  }, 120_000)

  it('adds a row written before the backfill to the cell the backfill finds, not over it', async () => {
    const { sqlite, k } = await kitFor(34, '0038')
    for (const cents of [100, 200, 300]) await make(k, OWNER, { amountCents: cents })
    for (const statement of SETUP) sqlite.exec(statement.sql)
    await make(k, OWNER, { amountCents: 50 })
    for (const statement of BACKFILLS) sqlite.exec(statement.sql)
    await assertRollup(k, 'the backfill after one write')
    const cell = sqlite.prepare('SELECT sum_cents, n FROM ledger_cells WHERE owner = ?').all(OWNER)
    expect(cell).toEqual([{ sum_cents: 650, n: 4 }])
  })

  it('can be applied twice', async () => {
    const { sqlite, k } = await kitFor(33)
    await seedRows(k, 20)
    await walk(k, 80)
    applyMigrationSql(sqlite, MIGRATION)
    await assertRollup(k, 'applied again')
    const triggers = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'transactions' ORDER BY name").all()
    expect(triggers.map((t) => (t as { name: string }).name)).toEqual([
      'ledger_rollup_ad', 'ledger_rollup_ai', 'ledger_rollup_au_amount', 'ledger_rollup_au_cell', 'ledger_rollup_au_month',
    ])
  })
})

const sources = import.meta.glob<string>(
  ['/functions/**/*.{ts,mjs}', '!/functions/**/*.test.ts', '/scripts/**/*.{ts,mjs,sql}', '!/scripts/**/*.test.ts', '/workers/**/*.ts', '/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}', '/migrations/*.sql'],
  { query: '?raw', import: 'default', eager: true },
)

describe('the delete trigger is the only way rows leave', () => {
  it('nothing replaces a row of transactions, which would delete it without firing the trigger', () => {
    const replacing = /(?:REPLACE\s+INTO|UPDATE\s+OR\s+REPLACE)\s+["`[]?transactions\b/i
    const found = Object.entries(sources).filter(([, text]) => replacing.test(text)).map(([file]) => file)
    expect(found).toEqual([])
    expect(Object.keys(sources).length).toBeGreaterThan(100)
  })
})
