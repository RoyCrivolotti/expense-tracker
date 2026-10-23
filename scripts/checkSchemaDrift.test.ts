// @vitest-environment node
// node:sqlite cannot be bundled for the default jsdom environment, and this suite is pure Node.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import {
  applyMigrations,
  diffNames,
  migrationAdding,
  migrationFiles,
  schemaOf,
  wranglerSaid,
} from './check-schema-drift.mjs'

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations')
const files = () => migrationFiles().map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name), 'utf8') }))

function migrated(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  applyMigrations(db)
  return db
}

describe('the schema the migrations produce', () => {
  it('include a column added by an ALTER TABLE, and one from a CREATE TABLE', () => {
    const columns = schemaOf(migrated())

    expect(columns.has('settings.investment_category_id')).toBe(true)
    expect(columns.has('settings.goal_levers')).toBe(true)
    expect(columns.has('goal_scenarios.contribution_schedule')).toBe(true)
    expect(columns.has('goal_scenarios.home_carry_rate')).toBe(true)
    expect(columns.has('goal_scenarios.retirement_years')).toBe(true)
    expect(columns.has('settings.market_volatility')).toBe(true)
    expect(columns.has('transactions.description')).toBe(true)
  })

  it('leave out SQLite\'s own tables', () => {
    expect([...schemaOf(migrated())].some((column) => column.startsWith('sqlite_'))).toBe(false)
  })

  it('include the indexes the migrations create, and none SQLite makes for itself', () => {
    const schema = [...schemaOf(migrated())]

    expect(schema).toContain('index idx_txn_pinned')
    expect(schema).toContain('index idx_txn_owner_desc_norm')
    expect(schema.filter((item) => item.startsWith('index sqlite_'))).toEqual([])
  })

  it('include the triggers a database has, written as "trigger name"', () => {
    const db = migrated()
    db.exec('CREATE TRIGGER t_example AFTER INSERT ON transactions BEGIN SELECT 1; END')

    expect(schemaOf(db)).toContain('trigger t_example')
  })
})

describe('diffNames', () => {
  it('finds a column the database lacks, which is how production drifted', () => {
    const expected = schemaOf(migrated())
    const actual = [...expected].filter((column) => column !== 'settings.investment_category_id')

    expect(diffNames(expected, actual)).toEqual({ missing: ['settings.investment_category_id'], extra: [] })
  })

  it('finds a column that is in the database and in no migration', () => {
    const expected = schemaOf(migrated())

    expect(diffNames(expected, [...expected, 'settings.left_over'])).toEqual({
      missing: [],
      extra: ['settings.left_over'],
    })
  })

  it('finds nothing when they match, whatever the order', () => {
    const expected = [...schemaOf(migrated())]

    expect(diffNames(expected, [...expected].reverse())).toEqual({ missing: [], extra: [] })
  })

  it('reports each side sorted, so a run reads the same every time', () => {
    expect(diffNames(['b.z', 'a.y'], ['c.x', 'a.w'])).toEqual({ missing: ['a.y', 'b.z'], extra: ['a.w', 'c.x'] })
  })
})

describe('migrationAdding', () => {
  it('names the file that added a column to an existing table', () => {
    expect(migrationAdding('settings.investment_category_id', files())).toBe('0026_investment_category.sql')
    expect(migrationAdding('settings.goal_levers', files())).toBe('0030_goal_levers.sql')
    expect(migrationAdding('goal_scenarios.contribution_schedule', files())).toBe('0031_contribution_schedule.sql')
    expect(migrationAdding('goal_scenarios.home_carry_rate', files())).toBe('0032_home_carry_rate.sql')
    expect(migrationAdding('goal_scenarios.retirement_years', files())).toBe('0033_retirement_years.sql')
    expect(migrationAdding('settings.market_volatility', files())).toBe('0034_market_volatility.sql')
  })

  it('names the file that created an index', () => {
    expect(migrationAdding('index idx_txn_pinned', files())).toBe('0037_pinned_rows_index.sql')
    expect(migrationAdding('index idx_txn_owner_desc_norm', files())).toBe('0038_description_norm.sql')
  })

  it('names the file that created a trigger, however the name is quoted', () => {
    const sql = 'CREATE UNIQUE INDEX IF NOT EXISTS "idx_a" ON t (a);\nCREATE TRIGGER IF NOT EXISTS `trg_b` AFTER INSERT ON t BEGIN SELECT 1; END;'
    const file = [{ name: '0040_x.sql', sql }]

    expect(migrationAdding('index idx_a', file)).toBe('0040_x.sql')
    expect(migrationAdding('trigger trg_b', file)).toBe('0040_x.sql')
    expect(migrationAdding('trigger idx_a', file)).toBeNull()
  })

  it('does not take an index whose name only starts the same for it', () => {
    const file = [{ name: '0040_x.sql', sql: 'CREATE INDEX IF NOT EXISTS idx_ab ON t (a);' }]

    expect(migrationAdding('index idx_a', file)).toBeNull()
  })

  it('names the file that created the table for a column that came with it', () => {
    expect(migrationAdding('wealth_accounts.name', files())).toMatch(/^00\d\d_/)
  })

  it('is null for a column no migration adds', () => {
    expect(migrationAdding('settings.left_over', files())).toBeNull()
    expect(migrationAdding('not-a-column', files())).toBeNull()
  })

  it('does not take a name that appears elsewhere in a file for the table\'s column', () => {
    const sql = [
      'CREATE TABLE things (id INTEGER PRIMARY KEY, label TEXT);',
      'CREATE TABLE others (id INTEGER PRIMARY KEY, colour TEXT);',
    ].join('\n')

    expect(migrationAdding('things.colour', [{ name: '0001_x.sql', sql }])).toBeNull()
    expect(migrationAdding('others.colour', [{ name: '0001_x.sql', sql }])).toBe('0001_x.sql')
  })
})

describe('wranglerSaid', () => {
  it('gives the reason wrangler reports as JSON on stdout, with its notes', () => {
    const stdout = JSON.stringify({ error: { text: 'A request failed.', notes: [{ text: 'not authorized' }] } })

    expect(wranglerSaid({ stdout: `banner\n${stdout}` })).toBe(': A request failed. not authorized')
  })

  it('falls back to the last lines of stderr when stdout has no JSON', () => {
    expect(wranglerSaid({ stdout: 'plain', stderr: 'one\ntwo\nthree\n' })).toBe(': two three')
  })

  it('falls back to stderr when the JSON is not an error report', () => {
    expect(wranglerSaid({ stdout: '{ not json', stderr: 'it broke' })).toBe(': it broke')
  })

  it('says nothing when it has nothing to say, or was not given an error', () => {
    expect(wranglerSaid({ stdout: '', stderr: '' })).toBe('')
    expect(wranglerSaid(null)).toBe('')
    expect(wranglerSaid('a string')).toBe('')
  })
})
