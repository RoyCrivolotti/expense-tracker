// @vitest-environment node
// node:sqlite cannot be bundled for the default jsdom environment, and this suite is pure Node.
//
// No migration under migrations/ has a trigger yet, so this runs every tool that reads migrations over a
// directory that does (fixtures/trigger-migrations), to show that a trigger gets through each of them, and
// that the schema check notices when one is missing. wrangler is replaced by a stand-in that answers a
// query the way `wrangler d1 execute --remote --json` prints it, from a SQLite database, so nothing here
// reaches Cloudflare.
import type { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { applyMigrationSql, migratedDatabase } from '../src/testing/sqliteD1'
import { SCHEMA_QUERY, applyMigrations, checkSchema, migrationAdding, schemaOf } from './check-schema-drift.mjs'
import { lintMigration } from './lint-migrations.mjs'

const FIXTURES = join(import.meta.dirname, 'fixtures', 'trigger-migrations')
const BASE = '0001_items.sql'
const TRIGGERS = '0002_item_totals_triggers.sql'
const read = (name: string) => readFileSync(join(FIXTURES, name), 'utf8')

function fixtureDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  applyMigrations(db, FIXTURES)
  return db
}

/** A wrangler that answers from `deployed`, and keeps the commands it was given. */
function wranglerOver(deployed: DatabaseSync) {
  const commands: string[][] = []
  const exec = ((file: string, args: string[]) => {
    commands.push([file, ...args])
    const results = deployed.prepare(args[args.indexOf('--command') + 1]).all()
    return `wrangler 4.0.0\n${JSON.stringify([{ results, success: true, meta: {} }])}`
  }) as unknown as typeof execFileSync
  return { exec, commands }
}

describe('a trigger in a migration', () => {
  it('passes the lint', () => {
    expect(lintMigration(TRIGGERS, read(TRIGGERS))).toEqual([])
    expect(lintMigration(BASE, read(BASE))).toEqual([])
  })

  it('is not read as a backfill when its body updates without a WHERE', () => {
    const sql = 'CREATE TRIGGER IF NOT EXISTS bump AFTER INSERT ON items BEGIN UPDATE meta SET version = version + 1; END;'

    expect(lintMigration('0032_bump.sql', sql)).toEqual([])
  })

  it('still needs IF NOT EXISTS', () => {
    const sql = 'CREATE TRIGGER bump AFTER INSERT ON items BEGIN UPDATE meta SET version = version + 1; END;'

    expect(lintMigration('0032_bump.sql', sql)).toEqual([expect.stringMatching(/needs IF NOT EXISTS/)])
  })

  it('is applied whole by the test database, and works', () => {
    const db = new DatabaseSync(':memory:')
    for (const file of [BASE, TRIGGERS]) applyMigrationSql(db, read(file))

    db.exec("INSERT INTO items (kind, cents) VALUES ('a', 500), ('a', 250), ('b', 100)")
    db.exec("DELETE FROM items WHERE kind = 'a' AND cents = 500")

    expect(db.prepare('SELECT kind, n, cents FROM item_totals ORDER BY kind').all()).toEqual([
      { kind: 'a', n: 1, cents: 250 },
      { kind: 'b', n: 1, cents: 100 },
    ])
    expect(db.prepare('SELECT note FROM item_log ORDER BY rowid').all()).toEqual([
      { note: 'counted; a' },
      { note: 'counted; a' },
      { note: 'counted; b' },
    ])
  })

  it('is in the schema the migrations produce', () => {
    const schema = schemaOf(fixtureDatabase())

    expect(schema).toContain('trigger items_after_insert')
    expect(schema).toContain('trigger items_after_delete')
    expect(schema).toContain('index idx_items_kind')
    expect(schema).toContain('items.cents')
  })

  it('leaves out the indexes SQLite makes for a primary key', () => {
    const db = fixtureDatabase()
    const made = db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'sqlite_autoindex%'").all()

    expect(made).not.toEqual([])
    expect([...schemaOf(db)].filter((item) => item.includes('sqlite_'))).toEqual([])
  })

  it('names the migration that adds it', () => {
    const files = [BASE, TRIGGERS].map((name) => ({ name, sql: read(name) }))

    expect(migrationAdding('trigger items_after_delete', files)).toBe(TRIGGERS)
    expect(migrationAdding('index idx_items_kind', files)).toBe(BASE)
    expect(migrationAdding('trigger not_there', files)).toBeNull()
  })
})

describe('the schema check, reading a database through a stand-in for wrangler', () => {
  it('finds nothing when the database has what the migrations make', async () => {
    const { exec, commands } = wranglerOver(fixtureDatabase())

    const result = await checkSchema('demo-db', { exec, dir: FIXTURES })

    expect(result.err).toEqual([])
    expect(result.out.at(-1)).toBe('No drift.')
    expect(result.code).toBe(0)
    expect(result.out[0]).toMatch(/demo-db: .*2 triggers/)
    expect(commands).toHaveLength(1)
    expect(commands[0]).toEqual(
      expect.arrayContaining(['wrangler', 'd1', 'execute', 'demo-db', '--remote', '--json', '--command', SCHEMA_QUERY]),
    )
  })

  it('fails when a trigger is missing, and says which migration makes it', async () => {
    const deployed = fixtureDatabase()
    deployed.exec('DROP TRIGGER items_after_delete')

    const result = await checkSchema('demo-db', { exec: wranglerOver(deployed).exec, dir: FIXTURES })

    expect(result.code).toBe(1)
    expect(result.err[0]).toBe(`MISSING trigger items_after_delete  (added by migrations/${TRIGGERS})`)
    expect(result.err).toHaveLength(2)
  })

  it('fails when an index is missing', async () => {
    const deployed = fixtureDatabase()
    deployed.exec('DROP INDEX idx_items_kind')

    const result = await checkSchema('demo-db', { exec: wranglerOver(deployed).exec, dir: FIXTURES })

    expect(result.code).toBe(1)
    expect(result.err[0]).toBe(`MISSING index idx_items_kind  (added by migrations/${BASE})`)
  })

  it('only warns about an index that no migration makes', async () => {
    const deployed = fixtureDatabase()
    deployed.exec('CREATE INDEX idx_by_hand ON items (cents)')

    const result = await checkSchema('demo-db', { exec: wranglerOver(deployed).exec, dir: FIXTURES })

    expect(result.code).toBe(0)
    expect(result.err).toEqual([])
    expect(result.warn).toEqual([expect.stringMatching(/^WARNING index idx_by_hand {2}\(in the database, in no migration/)])
    expect(result.out.at(-1)).toBe('No drift, apart from the warnings.')
  })

  it('fails on a trigger that no migration makes, since it can change data', async () => {
    const deployed = fixtureDatabase()
    deployed.exec('CREATE TRIGGER by_hand AFTER INSERT ON items BEGIN SELECT 1; END')

    const result = await checkSchema('demo-db', { exec: wranglerOver(deployed).exec, dir: FIXTURES })

    expect(result.code).toBe(1)
    expect(result.err[0]).toBe('EXTRA   trigger by_hand  (in the database, in no migration)')
  })

  it('fails on a column that no migration makes', async () => {
    const deployed = fixtureDatabase()
    deployed.exec('ALTER TABLE items ADD COLUMN stray TEXT')

    const result = await checkSchema('demo-db', { exec: wranglerOver(deployed).exec, dir: FIXTURES })

    expect(result.code).toBe(1)
    expect(result.err[0]).toBe('EXTRA   items.stray  (in the database, in no migration)')
  })

  it('still lists a stray index as a warning when something else fails', async () => {
    const deployed = fixtureDatabase()
    deployed.exec('CREATE INDEX idx_by_hand ON items (cents)')
    deployed.exec('DROP TRIGGER items_after_delete')

    const result = await checkSchema('demo-db', { exec: wranglerOver(deployed).exec, dir: FIXTURES })

    expect(result.code).toBe(1)
    expect(result.err[0]).toMatch(/^MISSING trigger items_after_delete/)
    expect(result.err.join('\n')).not.toMatch(/idx_by_hand/)
    expect(result.warn).toHaveLength(1)
  })

  it('leaves out D1\'s own _cf_KV table, and any index or trigger on it', async () => {
    const deployed = fixtureDatabase()
    deployed.exec('CREATE TABLE _cf_KV (key TEXT, value BLOB, PRIMARY KEY (key)) WITHOUT ROWID')
    deployed.exec('CREATE INDEX idx_cf_kv_value ON _cf_KV (value)')
    deployed.exec('CREATE TRIGGER cf_kv_touch AFTER INSERT ON _cf_KV BEGIN SELECT 1; END')

    const result = await checkSchema('demo-db', { exec: wranglerOver(deployed).exec, dir: FIXTURES })

    expect(result).toMatchObject({ code: 0, err: [], warn: [] })
    expect(result.out.at(-1)).toBe('No drift.')
  })

  it('says so when the database cannot be read', async () => {
    const exec = (() => {
      throw Object.assign(new Error('Command failed'), { stdout: JSON.stringify({ error: { text: 'no such database' } }) })
    }) as unknown as typeof execFileSync

    const result = await checkSchema('demo-db', { exec, dir: FIXTURES })

    expect(result.code).toBe(2)
    expect(result.err[0]).toBe('Could not read demo-db: no such database')
  })
})

describe('the schema check on this repo\'s own migrations', () => {
  it('passes for a database they made', async () => {
    const result = await checkSchema('demo-db', { exec: wranglerOver(migratedDatabase()).exec })

    expect(result).toMatchObject({ code: 0, err: [] })
  })

  it('fails for one that lost an index', async () => {
    const deployed = migratedDatabase()
    deployed.exec('DROP INDEX idx_txn_pinned')

    const result = await checkSchema('demo-db', { exec: wranglerOver(deployed).exec })

    expect(result.code).toBe(1)
    expect(result.err[0]).toMatch(/^MISSING index idx_txn_pinned {2}\(added by migrations\/0037_pinned_rows_index\.sql\)$/)
  })
})
