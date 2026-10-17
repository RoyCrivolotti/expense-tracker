import { describe, expect, it } from 'vitest'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import type { ExpenseDataset } from '../../src/domain/types'
import { loadDataset } from './db'
import type { Env } from './env'
import { migratedDatabase, newStats, sqliteD1 } from '../../src/testing/sqliteD1'
import { seedDataset } from '../../src/testing/seedSqlite'

const OWNER = 'owner@example.com'

function envFor(dataset: ExpenseDataset): { env: Env; stats: ReturnType<typeof newStats> } {
  const db = migratedDatabase()
  seedDataset(db, OWNER, dataset)
  const stats = newStats()
  return { env: { DB: sqliteD1(db, stats) } as Env, stats }
}

describe('sqliteD1', () => {
  it('runs prepared statements the way D1 does and counts what it returns', async () => {
    const db = sqliteD1(migratedDatabase())
    await db.prepare('INSERT INTO categories (owner,id,name) VALUES (?,?,?)').bind(OWNER, 1, 'Food').run()
    const found = await db.prepare('SELECT id, name FROM categories WHERE owner = ?').bind(OWNER).all()
    expect(found.results).toEqual([{ id: 1, name: 'Food' }])
    expect(await db.prepare('SELECT name FROM categories WHERE id = ?').bind(1).first('name')).toBe('Food')
    expect(await db.prepare('SELECT name FROM categories WHERE id = ?').bind(9).first()).toBeNull()
    expect(await db.prepare('SELECT id, name FROM categories').raw()).toEqual([[1, 'Food']])
  })

  it('applies a batch as one transaction and rolls all of it back on a failure', async () => {
    const db = sqliteD1(migratedDatabase())
    const insert = (id: number) => db.prepare('INSERT INTO categories (owner,id,name) VALUES (?,?,?)').bind(OWNER, id, 'x')
    await expect(db.batch([insert(1), insert(1)])).rejects.toThrow()
    const after = await db.prepare('SELECT COUNT(*) AS n FROM categories').first<{ n: number }>()
    expect(after?.n).toBe(0)
    const results = await db.batch([insert(2), db.prepare('SELECT id FROM categories')])
    expect(results[0].meta.changes).toBe(1)
    expect(results[1].results).toEqual([{ id: 2 }])
  })
})

describe('loadDataset over a seeded synthetic ledger', () => {
  it('returns the ledger it was given, in the order the API promises', async () => {
    const given = syntheticLedger({ months: 8, perMonth: 15 })
    // An active plan makes loadDataset insert instalments the ledger does not hold.
    given.installmentPlans = given.installmentPlans.map((p) => ({ ...p, active: false }))
    const { env } = envFor(given)

    const loaded = await loadDataset(env, OWNER)

    expect(loaded.transactions).toEqual(given.transactions)
    expect(loaded.categories).toEqual(given.categories)
    expect(loaded.accounts).toEqual(given.accounts)
    expect(loaded.flags).toEqual(given.flags)
    expect(loaded.labels).toEqual(given.labels)
    expect(loaded.attachments).toEqual(given.attachments)
    expect(loaded.accountStatements).toEqual(given.accountStatements)
    expect(loaded.cashActuals).toEqual(given.cashActuals)
  })

  it('reads every transaction on every load, which is the cost this work removes', async () => {
    const given = syntheticLedger({ months: 6, perMonth: 20 })
    given.installmentPlans = []
    const { env, stats } = envFor(given)

    await loadDataset(env, OWNER)

    expect(stats.rowsReturned).toBeGreaterThanOrEqual(given.transactions.length)
  })
})
