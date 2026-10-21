// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { summarize } from '../../functions/_shared/measure/records'
import { measuredDb } from './d1Adapter'
import { SYNTHETIC_OWNER } from './guard'
import { BudgetExceeded } from './spend'
import { sqliteTransport } from './sqliteTransport'
import { databaseWithAnotherOwner, ledgerOf } from './testKit'

function adapter(writesEnabled: boolean, limits = {}, shouldStop?: () => boolean) {
  const db = databaseWithAnotherOwner()
  const transport = sqliteTransport(db)
  const ledger = ledgerOf(limits)
  return { ...measuredDb({ transport, ledger, writesEnabled, ...(shouldStop ? { shouldStop } : {}) }), ledger, sqlite: db, transport }
}

describe('the measured database', () => {
  it('answers first, all and run like D1 and notes each statement', async () => {
    const { db, recorder } = adapter(false)
    const count = await db.prepare('SELECT count(*) AS n FROM categories WHERE owner = ?').bind('alex@example.com').first<{ n: number }>()
    expect(count?.n).toBeGreaterThan(0)
    const column = await db.prepare('SELECT count(*) AS n FROM categories WHERE owner = ?').bind('alex@example.com').first<number>('n')
    expect(column).toBe(count?.n)
    expect(await db.prepare('SELECT * FROM categories WHERE owner = ?').bind('nobody@example.com').first()).toBeNull()
    expect(await db.prepare('SELECT name FROM categories WHERE owner = ?').bind('nobody@example.com').first('name')).toBeNull()
    const all = await db.prepare('SELECT id FROM categories WHERE owner = ?').bind('alex@example.com').all()
    expect(all.results.length).toBe(count?.n)
    const run = await db.prepare('SELECT 1').run()
    expect(run.results).toEqual([])
    expect(recorder.calls).toBe(6)
    expect(recorder.records).toHaveLength(6)
    expect(recorder.records[0]).toMatchObject({ batch: false, write: false })
  })

  it('counts a batch as one call and each statement inside it as one statement', async () => {
    const { db, recorder } = adapter(true)
    const before = summarize(recorder)
    await db.batch([
      db.prepare('SELECT 1').bind(),
      db.prepare('SELECT 2').bind(),
      db.prepare('SELECT 3').bind(),
    ])
    const summary = summarize(recorder, { records: before.statements, calls: before.calls })
    expect(summary).toMatchObject({ calls: 1, statements: 3 })
    expect(recorder.records.every((r) => r.batch)).toBe(true)
  })

  it('writes for the synthetic owner once writes are enabled, and charges the rows to the ledger', async () => {
    const { db, ledger, recorder, sqlite } = adapter(true)
    await db
      .prepare("INSERT INTO owner_revision (owner, token) VALUES (?, 'tok')")
      .bind(SYNTHETIC_OWNER)
      .run()
    expect(sqlite.prepare('SELECT token FROM owner_revision WHERE owner = ?').get(SYNTHETIC_OWNER)).toEqual({ token: 'tok' })
    expect(ledger.totals.written).toBe(1)
    expect(recorder.records[0]).toMatchObject({ write: true, rowsWritten: 1 })
  })

  it('refuses every write when writes are not enabled, and sends nothing', async () => {
    const { db, transport } = adapter(false)
    await expect(
      db.prepare("INSERT INTO owner_revision (owner, token) VALUES (?, 'tok')").bind(SYNTHETIC_OWNER).run(),
    ).rejects.toThrow(/without --write/)
    await expect(
      db.batch([db.prepare('DELETE FROM transactions WHERE owner = ?').bind(SYNTHETIC_OWNER)]),
    ).rejects.toThrow(/without --write/)
    expect(transport.sent).toHaveLength(0)
  })

  it('refuses a write for anyone but the synthetic owner even with writes enabled', async () => {
    const { db, sqlite } = adapter(true)
    await expect(db.prepare('DELETE FROM transactions WHERE owner = ?').bind('alex@example.com').run()).rejects.toThrow(/synthetic owner/)
    expect(Number((sqlite.prepare('SELECT count(*) AS n FROM transactions').get() as { n: number }).n)).toBeGreaterThan(0)
  })

  it('stops the moment the ledger is over its cap', async () => {
    const { db } = adapter(true, { readPerDay: 3 })
    await expect(db.prepare('SELECT * FROM categories WHERE owner = ?').bind('alex@example.com').all()).rejects.toThrow(BudgetExceeded)
  })

  it('refuses a batch when the ledger is already over', async () => {
    const { db, ledger } = adapter(true)
    ledger.totals.written = 1_000_000
    await expect(db.batch([db.prepare('SELECT 1').bind()])).rejects.toThrow(BudgetExceeded)
  })

  it('stops when the stop file appears', async () => {
    const { db, transport } = adapter(true, {}, () => true)
    await expect(db.prepare('SELECT 1').all()).rejects.toThrow(/stop file/)
    expect(transport.sent).toHaveLength(0)
  })
})
