// @vitest-environment node
/**
 * Weakens the rollup's triggers one way at a time, in a scratch database, and requires the oracle (the scenarios
 * and a short walk in ledgerRollup.integration.test.ts) to fail for each. A mutant that lives would be a way for a
 * trigger to be wrong that no test notices.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { splitStatements } from '../../../scripts/sql-statements.mjs'
import { applyMigrationSql, migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { OWNER } from '../../_shared/testing/expenseWorld'
import { emptySmallestMonth, pinningScenarios } from '../../_shared/testing/rollupScenarios'
import { shapeScenarios } from '../../_shared/testing/rollupScenariosShape'
import { MUTANTS, type Mutant } from '../../_shared/testing/rollupMutants'
import { newKit } from '../../_shared/testing/rollupWorld'
import { assertRollup } from '../../_shared/testing/rollupKit'
import { seedRows, walk } from '../../_shared/testing/rollupWalk'

afterEach(() => vi.useRealTimers())

const MIGRATION = readFileSync(join(import.meta.dirname, '..', '..', '..', 'migrations', '0039_ledger_rollup.sql'), 'utf8')

/** The migration with one statement changed; throws if the change finds nothing to change, so a mutant cannot be a no-op. */
function mutated(mutant: Mutant): string {
  const statements = splitStatements(MIGRATION)
  const index = statements.findIndex((s: { sql: string }) => s.sql.includes(mutant.in))
  expect(index, `${mutant.name}: no statement contains ${mutant.in}`).toBeGreaterThanOrEqual(0)
  const original = statements[index]!.sql
  const changed = mutant.edit(original)
  expect(changed, `${mutant.name}: the edit changed nothing`).not.toBe(original)
  return statements.map((s: { sql: string }, i: number) => (i === index ? changed : s.sql)).join(';\n') + ';\n'
}

const BACKFILL = /^(INSERT OR REPLACE|DELETE FROM ledger_\w+ WHERE n )/

/**
 * A backfill is tested over rows that exist before it runs, built without triggers, and over a ledger that is
 * written to between the triggers and the backfill, which is the order the migration runs in.
 */
async function backfillIsWrong(sql: string): Promise<boolean> {
  for (const raced of [false, true]) {
    const sqlite = migratedDatabase('0038')
    const k = await newKit(sqlite, sqliteD1(sqlite, newStats()), raced ? 22 : 21)
    await seedRows(k, 20)
    await walk(k, 100, false)
    sqlite.exec("INSERT INTO transactions (owner, date, budget_month, description, account_id, category_id, type, amount_cents, cancelled) SELECT owner, date, budget_month, 'Zero', account_id, category_id, type, 0, cancelled FROM transactions WHERE amount_cents > 0 LIMIT 3")
    const statements: Array<{ sql: string }> = splitStatements(sql)
    if (raced) {
      for (const s of statements.filter((x) => !BACKFILL.test(x.sql))) sqlite.exec(s.sql)
      await walk(k, 60, false)
      await emptySmallestMonth(k, OWNER)
      for (const s of statements.filter((x) => BACKFILL.test(x.sql))) sqlite.exec(s.sql)
    } else {
      applyMigrationSql(sqlite, sql)
    }
    try {
      await assertRollup(k, 'the backfill')
    } catch {
      return true
    }
  }
  return false
}

/** True if some scenario or walk fails against the database the mutant produces. */
async function triggersAreWrong(sql: string): Promise<boolean> {
  const kitFor = async (seed: number) => {
    const sqlite = migratedDatabase('0038')
    applyMigrationSql(sqlite, sql)
    return newKit(sqlite, sqliteD1(sqlite, newStats()), seed)
  }
  try {
    for (const scenario of [...pinningScenarios, ...shapeScenarios]) await scenario.run(await kitFor(1))
    for (const seed of [11, 12, 13]) {
      const k = await kitFor(seed)
      await seedRows(k, 12)
      await walk(k, 120)
    }
    return false
  } catch {
    return true
  }
}

describe('the oracle fails when a trigger or a backfill is weakened', () => {
  it.each(MUTANTS)('$name', async (mutant) => {
    const sql = mutated(mutant)
    expect(() => applyMigrationSql(migratedDatabase('0038'), sql), 'the mutated migration must still be valid SQL').not.toThrow()
    expect(await (mutant.backfill ? backfillIsWrong(sql) : triggersAreWrong(sql))).toBe(true)
  }, 120_000)
})
