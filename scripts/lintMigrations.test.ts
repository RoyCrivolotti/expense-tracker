import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  GRANDFATHERED_THROUGH,
  lintMigration,
  lintNumbering,
  statementsOf,
} from './lint-migrations.mjs'

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations')
const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
const read = (file: string) => readFileSync(join(MIGRATIONS, file), 'utf8')
const lint = (sql: string) => lintMigration('0032_example.sql', sql)

describe('the migration files in the repo', () => {
  it('are numbered 0001 upwards with none missing or repeated', () => {
    expect(lintNumbering(files)).toEqual([])
  })

  it.each(files.filter((f) => Number(f.slice(0, 4)) > GRANDFATHERED_THROUGH))(
    '%s follows the rules',
    (file) => {
      expect(lintMigration(file, read(file))).toEqual([])
    },
  )

  it('would have stopped the table rebuilds in 0003 and the drop in 0023, which is why they predate the rule', () => {
    expect(lintMigration('0003_multi_user.sql', read('0003_multi_user.sql')).join('\n')).toMatch(/DROP TABLE settings/)
    expect(lintMigration('0023_drop_goal_inputs.sql', read('0023_drop_goal_inputs.sql')).join('\n')).toMatch(
      /DROP COLUMN liquid_net_worth_cents/,
    )
  })

  it('finds nothing to flag in any other file already applied', () => {
    const applied = files.filter((f) => Number(f.slice(0, 4)) <= GRANDFATHERED_THROUGH)
    const others = applied.filter((f) => !['0003_multi_user.sql', '0023_drop_goal_inputs.sql'].includes(f))

    expect(others.flatMap((f) => lintMigration(f, read(f)))).toEqual([])
  })
})

describe('splitting a file into statements', () => {
  it('keeps the comment lines directly above a statement and drops the rest', () => {
    const [first, second] = statementsOf(
      '-- adds a column\n-- lint-allow: destructive because\nALTER TABLE t ADD COLUMN c TEXT -- trailing\n  NOT NULL DEFAULT "";\n\nUPDATE t SET c = 1 WHERE id = 2;',
    )

    expect(first.notes).toEqual(['adds a column', 'lint-allow: destructive because'])
    expect(first.sql).toBe('ALTER TABLE t ADD COLUMN c TEXT NOT NULL DEFAULT ""')
    expect(second).toEqual({ notes: [], sql: 'UPDATE t SET c = 1 WHERE id = 2' })
  })
})

describe('destructive statements', () => {
  it.each([
    'DROP TABLE old_things',
    'DROP TABLE IF EXISTS old_things',
    'ALTER TABLE t DROP COLUMN c',
    'ALTER TABLE t RENAME TO t2',
    'ALTER TABLE t RENAME COLUMN a TO b',
  ])('refuses %s', (sql) => {
    expect(lint(sql)).toEqual([expect.stringMatching(/drops or renames something/)])
  })

  it('accepts one that says why it is safe', () => {
    expect(lint('-- lint-allow: destructive nothing has read it since 1.4\nDROP TABLE old_things')).toEqual([])
  })

  it('does not take an allowance with no reason', () => {
    expect(lint('-- lint-allow: destructive\nDROP TABLE old_things')).toHaveLength(1)
  })

  it('does not take an allowance for a different rule', () => {
    expect(lint('-- lint-allow: unscoped fine\nDROP TABLE old_things')).toHaveLength(1)
  })

  it('leaves adding things alone', () => {
    expect(lint('ALTER TABLE t ADD COLUMN c TEXT')).toEqual([])
  })
})

describe('statements that change every row', () => {
  it.each(['UPDATE t SET c = 1', 'DELETE FROM t'])('refuses %s', (sql) => {
    expect(lint(sql)).toEqual([expect.stringMatching(/changes every row/)])
  })

  it.each(['UPDATE t SET c = 1 WHERE c IS NULL', 'DELETE FROM t WHERE id = 3'])('accepts %s', (sql) => {
    expect(lint(sql)).toEqual([])
  })

  it('accepts one that says every row is meant', () => {
    expect(lint('-- lint-allow: unscoped the table is empty everywhere\nUPDATE t SET c = 1')).toEqual([])
  })
})

describe('creating things', () => {
  it.each(['CREATE TABLE t (id INTEGER)', 'CREATE INDEX i ON t (id)', 'CREATE UNIQUE INDEX i ON t (id)'])(
    'wants IF NOT EXISTS on %s',
    (sql) => {
      expect(lint(sql)).toEqual([expect.stringMatching(/needs IF NOT EXISTS/)])
    },
  )

  it.each(['CREATE TABLE IF NOT EXISTS t (id INTEGER)', 'CREATE UNIQUE INDEX IF NOT EXISTS i ON t (id)'])(
    'accepts %s',
    (sql) => {
      expect(lint(sql)).toEqual([])
    },
  )
})

describe('the file as a whole', () => {
  it('wants the NNNN_lower_snake_case.sql name', () => {
    expect(lintMigration('32_Example.sql', 'SELECT 1')).toEqual([expect.stringMatching(/name it NNNN_lower_snake_case/)])
  })

  it('refuses an empty file', () => {
    expect(lintMigration('0032_example.sql', '-- nothing here\n')).toEqual([expect.stringMatching(/no statements/)])
  })
})

describe('numbering', () => {
  it('spots two files with the same number, as two PRs adding the next one would', () => {
    expect(lintNumbering(['0001_a.sql', '0002_b.sql', '0002_c.sql'])).toEqual(['0002_c.sql and 0002_b.sql both use number 0002'])
  })

  it('spots a gap, once', () => {
    expect(lintNumbering(['0001_a.sql', '0002_b.sql', '0005_c.sql', '0006_d.sql'])).toEqual([
      'numbering skips from 0002 to 0005 at 0005_c.sql',
    ])
  })

  it('accepts an unbroken run', () => {
    expect(lintNumbering(['0001_a.sql', '0002_b.sql', '0003_c.sql'])).toEqual([])
  })
})
