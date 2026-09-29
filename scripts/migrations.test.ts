// @vitest-environment node
// node:sqlite cannot be bundled for the default jsdom environment, and this suite is
// pure Node anyway — it reads migration files and runs them against an in-memory DB.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import {
  applyOrder,
  backfillsBelowHighestApplied,
  describePlan,
  destructiveReason,
  invalidMigrationNames,
  isMissingTable,
  namesFromOutput,
  parseArgs,
  productionRefusal,
  recordProblem,
  selectPendingMigrations,
  stemOf,
  withRecord,
} from './migrate.mjs'

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

describe('the record check', () => {
  const files = ['0001_init.sql', '0002_b.sql', '0020_migrations_table.sql', '0021_c.sql']

  it('trusts a record that is complete up to where it stops', () => {
    const applied = ['0001_init', '0002_b', '0020_migrations_table']

    expect(recordProblem('prod', files, applied, () => true)).toBeNull()
  })

  it('names the database and the first unrecorded file when the record has a hole', () => {
    const problem = recordProblem('roy-expenses', files, ['0020_migrations_table'], () => true)

    expect(problem).toMatch(/^roy-expenses records 1 migration\(s\) but 2 earlier file\(s\) are unrecorded, starting with 0001_init\.sql/)
  })

  it('refuses an empty record on a database that already has tables, and only asks then', () => {
    const asked = vi.fn(() => true)

    expect(recordProblem('roy-expenses', files, [], asked)).toMatch(/existing database with an unseeded record/)
    expect(asked).toHaveBeenCalledOnce()

    // A database with a record is not asked, since looking costs a round trip.
    asked.mockClear()
    recordProblem('roy-expenses', files, ['0001_init'], asked)
    expect(asked).not.toHaveBeenCalled()
  })

  it('lets a fresh database through, where an empty record is the truth', () => {
    expect(recordProblem('roy-expenses-dev', files, [], () => false)).toBeNull()
  })
})

describe('apply order', () => {
  it('puts the migration that creates the tracking table first', () => {
    expect(applyOrder(['0019_x.sql', '0020_migrations_table.sql', '0021_y.sql'])).toEqual([
      '0020_migrations_table.sql',
      '0019_x.sql',
      '0021_y.sql',
    ])
  })

  it('leaves the order alone when the tracking table is already there', () => {
    expect(applyOrder(['0021_y.sql', '0022_z.sql'])).toEqual(['0021_y.sql', '0022_z.sql'])
  })
})

describe('which databases a run covers', () => {
  it('is dev alone by default, so the old command keeps its meaning', () => {
    expect(parseArgs([])).toEqual({ targets: ['dev'], dryRun: false, yes: false })
  })

  it('takes one database, or both with dev first so it goes ahead of production', () => {
    expect(parseArgs(['prod']).targets).toEqual(['prod'])
    expect(parseArgs(['all']).targets).toEqual(['dev', 'prod'])
  })

  it('reads the flags in any position', () => {
    expect(parseArgs(['--dry-run', 'all'])).toEqual({ targets: ['dev', 'prod'], dryRun: true, yes: false })
    expect(parseArgs(['prod', '--yes']).yes).toBe(true)
  })

  it('rejects what it does not know rather than guessing a database', () => {
    expect(() => parseArgs(['production'])).toThrow(/Unknown target "production"/)
    expect(() => parseArgs(['dev', 'prod'])).toThrow(/Unknown target/)
    expect(() => parseArgs(['--force'])).toThrow(/Unknown option --force/)
  })
})

describe('running against production', () => {
  const run = (targets: string[], flags: { dryRun?: boolean; yes?: boolean } = {}) => ({
    targets,
    dryRun: false,
    yes: false,
    ...flags,
  })

  it('takes --yes, since the deploy workflow is what normally does it', () => {
    expect(productionRefusal(run(['prod']))).toMatch(/migrated by the deploy workflow when a PR merges/)
    expect(productionRefusal(run(['dev', 'prod']))).not.toBeNull()
    expect(productionRefusal(run(['prod'], { yes: true }))).toBeNull()
  })

  it('leaves dev and a dry run alone, which change nothing in production', () => {
    expect(productionRefusal(run(['dev']))).toBeNull()
    expect(productionRefusal(run(['dev', 'prod'], { dryRun: true }))).toBeNull()
  })
})

describe('a migration that would break the live release', () => {
  it('names the statement that drops or renames', () => {
    expect(destructiveReason('ALTER TABLE a ADD COLUMN b TEXT;\nDROP TABLE goal_inputs;')).toBe('DROP TABLE')
    expect(destructiveReason('ALTER TABLE settings DROP COLUMN liquid;')).toBe('ALTER TABLE settings DROP')
    expect(destructiveReason('ALTER TABLE x_new RENAME TO x;')).toBe('ALTER TABLE x_new RENAME')
    expect(destructiveReason('delete from flags where id = 1;')).toBe('delete from')
    // What the live release queries or leans on goes the way a table does.
    expect(destructiveReason('DROP VIEW v_totals;')).toBe('DROP VIEW')
    expect(destructiveReason('DROP TRIGGER IF EXISTS t_audit;')).toBe('DROP TRIGGER')
    expect(destructiveReason('DROP INDEX idx_one_plan;')).toBe('DROP INDEX')
  })

  it('leaves additive and backfilling files alone', () => {
    expect(destructiveReason('ALTER TABLE settings ADD COLUMN assumed_inflation REAL;')).toBeNull()
    expect(destructiveReason('UPDATE t SET a = 1 WHERE a IS NULL;\nCREATE INDEX i ON t (a);')).toBeNull()
  })

  it('does not read comments as statements', () => {
    expect(destructiveReason('-- this used to DROP TABLE x\n/* DELETE FROM y */\nALTER TABLE t ADD COLUMN c TEXT;')).toBeNull()
  })

  it('takes the marker as the author saying the live release no longer reads it', () => {
    expect(destructiveReason('-- migrate: destructive-ok\nDROP TABLE goal_inputs;')).toBeNull()
    expect(destructiveReason('-- Migrate:   DESTRUCTIVE-OK (nothing reads it since 0022)\nDROP TABLE t;')).toBeNull()
  })

  it('catches the drops already in the history, and none of the recent additive files', () => {
    const read = (f: string) => readFileSync(join(MIGRATIONS, f), 'utf8')
    expect(destructiveReason(read('0003_multi_user.sql'))).not.toBeNull()
    expect(destructiveReason(read('0023_drop_goal_inputs.sql'))).not.toBeNull()
    for (const f of ['0020_migrations_table.sql', '0025_cash_reserve_months.sql', '0026_investment_category.sql', '0027_assumed_inflation.sql']) {
      expect(destructiveReason(read(f)), f).toBeNull()
    }
  })
})

describe('telling a database that is not set up from one that could not be read', () => {
  it('takes a missing table as the one failure that is an answer', () => {
    expect(isMissingTable({ stderr: '✘ [ERROR] no such table: _migrations: SQLITE_ERROR [code: 7500]' })).toBe(true)
    expect(isMissingTable({ stdout: '{"error":{"text":"no such table: transactions: SQLITE_ERROR"}}' })).toBe(true)
    expect(isMissingTable({ message: 'Command failed: npx wrangler\nNo such table: _migrations' })).toBe(true)
  })

  it('does not take an auth failure, a dropped connection or an outage for one', () => {
    expect(isMissingTable({ stderr: '✘ [ERROR] Authentication error [code: 10000]' })).toBe(false)
    expect(isMissingTable({ message: 'TypeError: fetch failed' })).toBe(false)
    expect(isMissingTable({ stderr: 'D1 reset before execute completed!' })).toBe(false)
    expect(isMissingTable({ stderr: 'no such column: assumed_inflation' })).toBe(false)
    expect(isMissingTable({})).toBe(false)
    expect(isMissingTable(undefined as never)).toBe(false)
  })

  it('reads the names from either shape of wrangler output, and an empty record as empty', () => {
    expect(namesFromOutput('[{"results":[{"name":"0001_init"},{"name":"0002_b"}],"success":true}]')).toEqual(['0001_init', '0002_b'])
    expect(namesFromOutput('{"result":[{"results":[{"name":"0001_init"}]}]}')).toEqual(['0001_init'])
    expect(namesFromOutput('[{"results":[]}]')).toEqual([])
  })

  it('refuses output that is not that shape instead of reading it as an empty record', () => {
    expect(() => namesFromOutput('[]')).toThrow(/unexpected output/)
    expect(() => namesFromOutput('{"error":{"text":"Authentication error"}}')).toThrow(/unexpected output/)
    expect(() => namesFromOutput('[{"success":true}]')).toThrow(/unexpected output/)
    expect(() => namesFromOutput('not json')).toThrow()
  })
})

describe('migration file names', () => {
  it('are all the kind the record can take', () => {
    expect(invalidMigrationNames(migrationFiles())).toEqual([])
  })

  it('flags a name that would not sit in a quoted SQL string, or does not follow the pattern', () => {
    expect(invalidMigrationNames(["0028_it's.sql", "0028_x');DROP TABLE t;--.sql", '28_x.sql', '0028_Upper.sql', '0028-x.sql', '0028_.sql'])).toHaveLength(6)
    // Not a migration at all, so not this check's business.
    expect(invalidMigrationNames(['README.md', '.gitkeep'])).toEqual([])
  })

  it('cannot reach the record: a name that does not follow the pattern is not written into it', () => {
    expect(() => withRecord('SELECT 1;', "0028_it's.sql")).toThrow(/not a migration file name/)
    expect(() => withRecord('SELECT 1;', "0028_x');DROP TABLE t;--.sql")).toThrow(/not a migration file name/)
  })
})

describe('recording a migration with the import that applies it', () => {
  it('follows the file with its own row', () => {
    expect(withRecord('ALTER TABLE t ADD COLUMN c TEXT;\n\n', '0028_c.sql')).toBe(
      "ALTER TABLE t ADD COLUMN c TEXT;\nINSERT OR IGNORE INTO _migrations (name) VALUES ('0028_c');\n",
    )
  })

  it('needs every migration to end in a statement, or the row would run into it', () => {
    for (const file of migrationFiles()) {
      const code = readFileSync(join(MIGRATIONS, file), 'utf8').replace(/--.*$/gm, '').trim()
      expect(code.endsWith(';'), `${file} must end in a semicolon`).toBe(true)
    }
  })

  it('records every file from the tracking table on, against the real schema', () => {
    const db = new DatabaseSync(':memory:')
    const files = migrationFiles()
    const from = files.indexOf('0020_migrations_table.sql')
    // What a database that already ran 0001-0019 looks like, then what the script sends.
    for (const f of files.slice(0, from)) for (const st of statementsOf(f)) db.exec(st)
    for (const f of files.slice(from)) db.exec(withRecord(readFileSync(join(MIGRATIONS, f), 'utf8'), f))

    const recorded = (db.prepare('SELECT name FROM _migrations ORDER BY name').all() as { name: string }[]).map((r) => r.name)
    expect(recorded).toEqual(files.slice(from).map(stemOf))
  })
})

describe('the status line', () => {
  it('says what is pending, or that nothing is', () => {
    expect(describePlan('prod', 'roy-expenses', 24, ['0025_a.sql', '0026_b.sql'])).toBe(
      'prod  roy-expenses  24 applied, 2 pending: 0025_a.sql, 0026_b.sql',
    )
    expect(describePlan('dev', 'roy-expenses-dev', 27, [])).toBe('dev   roy-expenses-dev  27 applied, nothing pending')
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
