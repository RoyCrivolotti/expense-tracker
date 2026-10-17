/**
 * Migration 0038 on a database that already holds transactions, which is the only way production meets it.
 * Every other test starts from the finished schema, where a row is always written by code that knows the
 * column, so none of them would notice a migration that gave existing rows a value (or a default) and so
 * left them out of every read that groups by the column without the 503 that says they are still waiting.
 */
import { describe, expect, it } from 'vitest'
import { applyMigration, migratedDatabase, migrationFiles } from '../../src/testing/sqliteD1'

const THIS = migrationFiles().find((f) => f.startsWith('0038_'))!

function seeded() {
  const sqlite = migratedDatabase('0037')
  sqlite.exec('PRAGMA foreign_keys = OFF')
  const insert = sqlite.prepare(
    "INSERT INTO transactions (owner, date, budget_month, description, account_id, category_id, type, amount_cents, cancelled, created_at) VALUES (?, '2026-01-05', '2026-01', ?, 1, 1, 'expense', 100, 0, '2026-01-05T00:00:00Z')",
  )
  for (const description of ['Café', '  Rent  ', '']) insert.run('someone@example.com', description)
  return sqlite
}

describe('migration 0038 applied to rows that already exist', () => {
  it('is the file this test means', () => {
    expect(THIS).toBe('0038_description_norm.sql')
    expect(migrationFiles().length).toBeGreaterThan(30)
  })

  it('adds a nullable column with no default, so every old row is waiting and none is silently complete', () => {
    const sqlite = seeded()
    applyMigration(sqlite, THIS)
    const column = (sqlite.prepare("SELECT name, type, \"notnull\" AS required, dflt_value AS dflt FROM pragma_table_info('transactions') WHERE name = 'description_norm'").all() as unknown as Array<{ type: string; required: number; dflt: unknown }>)[0]!
    expect(column).toMatchObject({ type: 'TEXT', required: 0, dflt: null })
    const values = sqlite.prepare('SELECT description_norm AS v FROM transactions ORDER BY id').all() as unknown as Array<{ v: unknown }>
    expect(values).toEqual([{ v: null }, { v: null }, { v: null }])
  })

  it('builds the index on the owner, the normalized text and the date, in that order', () => {
    const sqlite = seeded()
    applyMigration(sqlite, THIS)
    const columns = sqlite.prepare("SELECT name FROM pragma_index_info('idx_txn_owner_desc_norm') ORDER BY seqno").all() as unknown as Array<{ name: string }>
    expect(columns.map((c) => c.name)).toEqual(['owner', 'description_norm', 'date'])
  })

  it('is the last thing that touches the data: a later insert by the previous code is waiting too', () => {
    const sqlite = seeded()
    applyMigration(sqlite, THIS)
    sqlite
      .prepare("INSERT INTO transactions (owner, date, budget_month, description, account_id, category_id, type, amount_cents, cancelled, created_at) VALUES ('someone@example.com', '2026-02-01', '2026-02', 'Late', 1, 1, 'expense', 100, 0, '2026-02-01T00:00:00Z')")
      .run()
    expect((sqlite.prepare('SELECT count(*) AS n FROM transactions WHERE description_norm IS NULL').get() as { n: number }).n).toBe(4)
  })
})
