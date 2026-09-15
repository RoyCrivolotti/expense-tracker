// @vitest-environment node
// node:sqlite cannot be bundled for the default jsdom environment, and this suite is
// pure Node anyway — it reads migration files and runs them against an in-memory DB.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import {
  backfillsBelowHighestApplied,
  selectPendingMigrations,
  stemOf,
} from './migrate-dev.mjs'

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations')

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

/** Split into statements the way the documented `--command` fallback does. */
function statementsOf(file: string): string[] {
  return readFileSync(join(MIGRATIONS, file), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}

function applyAll(db: DatabaseSync): void {
  for (const file of migrationFiles()) {
    for (const statement of statementsOf(file)) db.exec(statement)
  }
}

describe('migration selection', () => {
  it('skips every file already recorded', () => {
    const files = migrationFiles()
    const applied = files.slice(0, -1).map(stemOf)

    expect(selectPendingMigrations(files, applied)).toEqual([files[files.length - 1]])
  })

  it('returns everything for a database with no record', () => {
    expect(selectPendingMigrations(migrationFiles(), [])).toEqual(migrationFiles())
  })

  it('ignores non-sql files and sorts numerically', () => {
    const picked = selectPendingMigrations(['0002_b.sql', 'README.md', '0001_a.sql'], [])

    expect(picked).toEqual(['0001_a.sql', '0002_b.sql'])
  })
})

describe('an incomplete migration record', () => {
  it('spots files below the highest recorded one', () => {
    // The state that matters: 0020 applied and recorded, the seed for 0001-0019 never
    // run. Those files are not pending, they are unrecorded, and re-applying them hands
    // 0003's four DROP TABLEs to a populated database.
    const files = migrationFiles()
    const applied = ['0020_migrations_table']
    const pending = selectPendingMigrations(files, applied)

    const backfills = backfillsBelowHighestApplied(pending, applied)

    expect(backfills[0]).toBe('0001_init.sql')
    expect(backfills).toContain('0003_multi_user.sql')
    expect(backfills.every((f) => Number(f.slice(0, 4)) < 20)).toBe(true)
  })

  it('leaves a genuinely newer file alone', () => {
    const files = migrationFiles()
    const applied = ['0020_migrations_table']

    expect(backfillsBelowHighestApplied(selectPendingMigrations(files, applied), applied))
      .not.toContain('0021_report_snapshot.sql')
  })

  it('finds nothing on a fresh database, where every file really is pending', () => {
    const files = migrationFiles()

    expect(backfillsBelowHighestApplied(selectPendingMigrations(files, []), [])).toEqual([])
  })

  it('finds nothing on a correctly seeded database', () => {
    const files = migrationFiles()
    const applied = files.slice(0, -1).map(stemOf)

    expect(backfillsBelowHighestApplied(selectPendingMigrations(files, applied), applied))
      .toEqual([])
  })
})

describe('migration safety', () => {
  it('applies cleanly to a fresh database', () => {
    const db = new DatabaseSync(':memory:')

    expect(() => applyAll(db)).not.toThrow()
  })

  it('is a no-op on a fully-migrated database, because nothing is pending', () => {
    const db = new DatabaseSync(':memory:')
    applyAll(db)
    const applied = migrationFiles().map(stemOf)

    // The guarantee is "never handed to the database again", not "harmless to re-run".
    expect(selectPendingMigrations(migrationFiles(), applied)).toEqual([])
  })

  it('a re-run of 0003 no longer reassigns a row that already has an owner', () => {
    const db = new DatabaseSync(':memory:')
    applyAll(db)
    db.exec(
      "INSERT INTO categories (owner, name, monthly_budget_cents, sort_order, active) VALUES ('someone@example.com', 'Groceries', 50000, 1, 1)",
    )

    // The `--command` fallback runs statements individually, so it walks straight past
    // the duplicate-column error that stops a `--file` run.
    const statements = statementsOf('0003_multi_user.sql')
    expect(() => db.exec(statements[0])).toThrow(/duplicate column/i)
    for (const statement of statements.filter((st) => /^UPDATE \w+ SET owner/i.test(st))) {
      db.exec(statement)
    }

    const row = db.prepare('SELECT owner FROM categories').get() as { owner: string }
    expect(row.owner).toBe('someone@example.com')
  })

  it('but the table rebuilds in 0003 still destroy data, which is why tracking is the guarantee', () => {
    const db = new DatabaseSync(':memory:')
    applyAll(db)
    db.exec(
      "INSERT INTO cash_actuals (owner, year_month, actual_cash_cents, updated_at) VALUES ('someone@example.com', '2026-01', 12345, '2026-01-31')",
    )

    // Scoping the backfills defangs the UPDATEs; nothing in plain SQL defangs a
    // DROP TABLE. Only never running the file again does.
    for (const statement of statementsOf('0003_multi_user.sql')) {
      if (!/^(INSERT INTO cash_actuals_new|DROP TABLE cash_actuals|ALTER TABLE cash_actuals_new|CREATE TABLE IF NOT EXISTS cash_actuals_new)/i.test(statement)) continue
      db.exec(statement)
    }

    const row = db.prepare("SELECT owner FROM cash_actuals WHERE year_month = '2026-01'").get() as
      | { owner: string }
      | undefined
    expect(row?.owner).toBe('owner@example.com')
  })
})
