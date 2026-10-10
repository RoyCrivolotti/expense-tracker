// @vitest-environment node
// node:sqlite cannot be bundled for the default jsdom environment, and this suite is pure Node.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import {
  applyMigrations,
  columnsOf,
  diffColumns,
  migrationAdding,
  migrationFiles,
  statementsOf,
  wranglerSaid,
} from './check-schema-drift.mjs'

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations')
const files = () => migrationFiles().map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name), 'utf8') }))

function migrated(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  applyMigrations(db)
  return db
}

describe('the columns the migrations produce', () => {
  it('include a column added by an ALTER TABLE, and one from a CREATE TABLE', () => {
    const columns = columnsOf(migrated())

    expect(columns.has('settings.investment_category_id')).toBe(true)
    expect(columns.has('settings.goal_levers')).toBe(true)
    expect(columns.has('goal_scenarios.contribution_schedule')).toBe(true)
    expect(columns.has('goal_scenarios.home_carry_rate')).toBe(true)
    expect(columns.has('goal_scenarios.retirement_years')).toBe(true)
    expect(columns.has('settings.market_volatility')).toBe(true)
    expect(columns.has('transactions.description')).toBe(true)
  })

  it('leave out SQLite\'s own tables', () => {
    expect([...columnsOf(migrated())].some((column) => column.startsWith('sqlite_'))).toBe(false)
  })
})

describe('diffColumns', () => {
  it('finds a column the database lacks, which is how production drifted', () => {
    const expected = columnsOf(migrated())
    const actual = [...expected].filter((column) => column !== 'settings.investment_category_id')

    expect(diffColumns(expected, actual)).toEqual({ missing: ['settings.investment_category_id'], extra: [] })
  })

  it('finds a column that is in the database and in no migration', () => {
    const expected = columnsOf(migrated())

    expect(diffColumns(expected, [...expected, 'settings.left_over'])).toEqual({
      missing: [],
      extra: ['settings.left_over'],
    })
  })

  it('finds nothing when they match, whatever the order', () => {
    const expected = [...columnsOf(migrated())]

    expect(diffColumns(expected, [...expected].reverse())).toEqual({ missing: [], extra: [] })
  })

  it('reports each side sorted, so a run reads the same every time', () => {
    expect(diffColumns(['b.z', 'a.y'], ['c.x', 'a.w'])).toEqual({ missing: ['a.y', 'b.z'], extra: ['a.w', 'c.x'] })
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

describe('statementsOf', () => {
  it('drops comments and splits on semicolons', () => {
    expect(statementsOf('-- a note\nCREATE TABLE t (a INTEGER);\n-- another\nALTER TABLE t ADD COLUMN b TEXT;\n')).toEqual([
      'CREATE TABLE t (a INTEGER)',
      'ALTER TABLE t ADD COLUMN b TEXT',
    ])
  })
})
