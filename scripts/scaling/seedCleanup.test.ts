// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { migratedDatabase } from '../../src/testing/sqliteD1'
import { datasetDeleteWrites } from './budget'
import { OWNER_TABLES, NOT_OWNER_SCOPED, cleanUp, ownerRowCounts, tableDeletes, transactionChunk } from './cleanup'
import { SYNTHETIC_OWNER, assertStatementAllowed } from './guard'
import { ledgerOfAbout } from './ledgerSize'
import { CALIBRATION_TOLERANCE, PlanWrong, runSeed } from './runSeed'
import { CALIBRATION_ROWS, ID_HEADROOM, readIdBases, seedSteps } from './seedSql'
import { BudgetExceeded } from './spend'
import { differences, fingerprintOthers } from './snapshot'
import { sqliteTransport } from './sqliteTransport'
import { MONTH, OTHER_OWNER, databaseWithAnotherOwner, ledgerOf, seededDatabase } from './testKit'

const count = (db: ReturnType<typeof migratedDatabase>, sql: string, ...params: string[]): number =>
  Number((db.prepare(sql).get(...params) as { n: number }).n)

describe('seeding a database that already holds someone else', () => {
  it('puts the whole ledger under the synthetic owner and leaves the other owner byte for byte alone', async () => {
    const db = databaseWithAnotherOwner()
    const transport = sqliteTransport(db)
    const before = await fingerprintOthers(transport, ledgerOf())
    const dataset = ledgerOfAbout(300, MONTH)
    const result = await runSeed(transport, seedSteps(dataset, await readIdBases(transport)), ledgerOf())

    expect(count(db, 'SELECT count(*) AS n FROM transactions WHERE owner = ?', SYNTHETIC_OWNER)).toBe(dataset.transactions.length)
    expect(count(db, 'SELECT count(*) AS n FROM categories WHERE owner = ?', SYNTHETIC_OWNER)).toBe(dataset.categories.length)
    expect(count(db, 'SELECT count(*) AS n FROM owner_revision WHERE owner = ?', SYNTHETIC_OWNER)).toBe(1)
    expect(result.calibration?.expected).toBeGreaterThan(0)
    expect(differences(before, await fingerprintOthers(transport, ledgerOf()))).toEqual([])
  })

  it('takes ids above everything the database holds, so it cannot collide', async () => {
    const { db } = await seededDatabase(200)
    const otherMax = count(db, 'SELECT max(id) AS n FROM transactions WHERE owner = ?', OTHER_OWNER)
    const ownMin = count(db, 'SELECT min(id) AS n FROM transactions WHERE owner = ?', SYNTHETIC_OWNER)
    expect(ownMin).toBeGreaterThan(otherMax + ID_HEADROOM - 1)
  })

  it('writes the same description_norm the app does, and the label links the ledger has', async () => {
    const { db } = await seededDatabase(200)
    expect(count(db, 'SELECT count(*) AS n FROM transactions WHERE owner = ? AND description_norm IS NULL', SYNTHETIC_OWNER)).toBe(0)
    expect(count(db, 'SELECT count(*) AS n FROM transaction_labels l JOIN transactions t ON t.id = l.transaction_id WHERE t.owner = ?', SYNTHETIC_OWNER)).toBeGreaterThan(0)
  })

  it('sends only statements the write guard lets through, each binding the synthetic owner', async () => {
    const { transport } = await seededDatabase(200)
    const writes = transport.sent.filter((s) => /^\s*insert/i.test(s.sql))
    expect(writes.length).toBeGreaterThan(5)
    for (const statement of writes) {
      expect(statement.params[0]).toBe(SYNTHETIC_OWNER)
      expect(() => assertStatementAllowed(statement.sql, statement.params, true)).not.toThrow()
    }
  })

  it('starts the transactions with a calibration chunk, then chunks of 500', () => {
    const steps = seedSteps(ledgerOfAbout(1300, MONTH), { categories: 0, accounts: 0, flags: 0, labels: 0, installment_plans: 0, transactions: 0 })
    const sizes = steps.filter((s) => s.table === 'transactions').map((s) => s.rows)
    expect(sizes[0]).toBe(CALIBRATION_ROWS)
    expect(sizes.slice(1, -1).every((n) => n === 500)).toBe(true)
  })
})

describe('the calibration stop', () => {
  it('stops after the first chunk when D1 reports more rows written than the plan assumed', async () => {
    const db = databaseWithAnotherOwner()
    const inner = sqliteTransport(db)
    const generous = {
      ...inner,
      query: async (s: Parameters<typeof inner.query>[0]) => {
        const reply = await inner.query(s)
        const inflated = s.sql.includes('INTO transactions') ? (reply.meta.rows_written ?? 0) * 40 : reply.meta.rows_written
        return { ...reply, meta: { ...reply.meta, rows_written: inflated } }
      },
    }
    const steps = seedSteps(ledgerOfAbout(300, MONTH), await readIdBases(inner))
    await expect(runSeed(generous, steps, ledgerOf())).rejects.toThrow(PlanWrong)
    expect(count(db, 'SELECT count(*) AS n FROM transactions WHERE owner = ?', SYNTHETIC_OWNER)).toBe(CALIBRATION_ROWS)
    expect(CALIBRATION_TOLERANCE).toBeGreaterThan(0)
  })

  it('stops when the stop file appears', async () => {
    const db = databaseWithAnotherOwner()
    const transport = sqliteTransport(db)
    const steps = seedSteps(ledgerOfAbout(200, MONTH), await readIdBases(transport))
    await expect(runSeed(transport, steps, ledgerOf(), () => true)).rejects.toThrow(/stop file/)
    expect(count(db, 'SELECT count(*) AS n FROM categories WHERE owner = ?', SYNTHETIC_OWNER)).toBe(0)
  })

  it('stops when the day cap would be crossed, before sending the statement that would cross it', async () => {
    const db = databaseWithAnotherOwner()
    const transport = sqliteTransport(db)
    const steps = seedSteps(ledgerOfAbout(200, MONTH), await readIdBases(transport))
    await expect(runSeed(transport, steps, ledgerOf({ writtenPerDay: 50 }))).rejects.toThrow(BudgetExceeded)
  })
})

describe('cleaning up', () => {
  it('removes every row of the synthetic owner and nothing of anyone else', async () => {
    const { db, transport, before } = await seededDatabase(300)
    const others = sqliteTransport(db)
    const ledger = ledgerOf()
    const result = await cleanUp(transport, ledger)

    expect(result.statements).toBeGreaterThan(OWNER_TABLES.length)
    const left = await ownerRowCounts(others, ledger)
    expect(Object.values(left).every((n) => n === 0)).toBe(true)
    expect(Object.keys(left)).toContain('transaction_labels_without_transaction')
    expect(differences(before, await fingerprintOthers(others, ledgerOf()))).toEqual([])
  })

  it('writes one row per row it removes, as the delete model says', async () => {
    const { transport } = await seededDatabase(300)
    const result = await cleanUp(transport, ledgerOf())
    expect(result.rowsWritten).toBe(datasetDeleteWrites(ledgerOfAbout(300, MONTH)))
  })

  it('deletes transactions in chunks until none are left', async () => {
    const { transport, db } = await seededDatabase(1200)
    await cleanUp(transport, ledgerOf())
    expect(count(db, 'SELECT count(*) AS n FROM transactions WHERE owner = ?', SYNTHETIC_OWNER)).toBe(0)
    const chunks = transport.sent.filter((s) => /DELETE FROM transactions WHERE id IN/.test(s.sql))
    expect(chunks.length).toBeGreaterThanOrEqual(3)
  })

  it('also removes what the routes leave behind: access rows, settings and scenarios of the owner', async () => {
    const { db, transport } = await seededDatabase(100)
    db.prepare("INSERT INTO allowed_users (email, status, granted_by) VALUES (?, 'active', 'test')").run(SYNTHETIC_OWNER)
    db.prepare("INSERT INTO user_group_grants (email, group_id, granted_by) VALUES (?, 'expenses', 'test')").run(SYNTHETIC_OWNER)
    db.prepare('INSERT INTO settings (owner) VALUES (?)').run(SYNTHETIC_OWNER)
    await cleanUp(transport, ledgerOf())
    const left = await ownerRowCounts(transport, ledgerOf())
    expect(left).toMatchObject({ allowed_users: 0, user_group_grants: 0, settings: 0 })
    expect(count(db, 'SELECT count(*) AS n FROM allowed_users WHERE email = ?', OTHER_OWNER)).toBe(1)
  })

  it('sends only owner-scoped deletes that bind the synthetic owner', () => {
    for (const statement of [...transactionChunk(), ...tableDeletes()]) {
      expect(statement.params).toEqual([SYNTHETIC_OWNER])
      expect(() => assertStatementAllowed(statement.sql, statement.params, true)).not.toThrow()
      expect(statement.sql).toMatch(/^DELETE FROM \w+ WHERE /)
    }
  })

  it('stops when the stop file appears', async () => {
    const { transport } = await seededDatabase(100)
    await expect(cleanUp(transport, ledgerOf(), () => true)).rejects.toThrow(/stop file/)
  })

  it('leaves a ledger that is over its cap with the error, not with a silent partial clean', async () => {
    const { transport } = await seededDatabase(200)
    await expect(cleanUp(transport, ledgerOf({ writtenPerDay: 5 }))).rejects.toThrow(BudgetExceeded)
  })
})

describe('knowing every table', () => {
  it('lists every table that names an owner or an email, and explains every one that does not', () => {
    const db = migratedDatabase()
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_cf_KV'")
      .all() as { name: string }[]
    const scoped = new Set(OWNER_TABLES.map((t) => t.table))
    for (const { name } of tables) {
      const columns = (db.prepare(`PRAGMA table_info(${name})`).all() as { name: string }[]).map((c) => c.name)
      const named = columns.includes('owner') ? 'owner' : columns.includes('email') ? 'email' : null
      if (named) {
        expect(scoped.has(name), `${name} has an ${named} column but is not in OWNER_TABLES`).toBe(true)
        expect(OWNER_TABLES.find((t) => t.table === name)?.column).toBe(named)
      } else {
        expect(NOT_OWNER_SCOPED[name], `${name} has no owner column: say why a delete by owner leaves nothing in it`).toBeTruthy()
      }
    }
  })

  it('lists no table the schema does not have', () => {
    const db = migratedDatabase()
    for (const { table } of OWNER_TABLES) expect(() => db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get()).not.toThrow()
  })
})
