// @vitest-environment node
// node:sqlite cannot be bundled for the default jsdom environment, and this suite is
// pure Node anyway — it reads migration files and runs them against an in-memory DB.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { selectPendingMigrations, stemOf } from './migrate-dev.mjs'

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

  it('re-applying 0003 to a populated database would reassign owners and drop tables', () => {
    const db = new DatabaseSync(':memory:')
    applyAll(db)
    db.exec(
      "INSERT INTO categories (owner, name, monthly_budget_cents, sort_order, active) VALUES ('someone@example.com', 'Groceries', 50000, 1, 1)",
    )

    // Statement 1 throwing is the only thing protecting a `--file` run; the
    // `--command` fallback continues past it into the destructive statements.
    const statements = statementsOf('0003_multi_user.sql')
    expect(() => db.exec(statements[0])).toThrow(/duplicate column/i)

    const destructive = statements.filter((s) => /^UPDATE (categories|accounts|transactions) SET owner/i.test(s))
    expect(destructive.length).toBeGreaterThan(0)
    for (const statement of destructive) {
      expect(statement).not.toMatch(/WHERE/i)
      db.exec(statement)
    }

    const row = db.prepare('SELECT owner FROM categories').get() as { owner: string }
    expect(row.owner).toBe('owner@example.com')
    expect(row.owner).not.toBe('someone@example.com')
  })
})
