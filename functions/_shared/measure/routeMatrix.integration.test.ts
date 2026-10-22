// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { cleanUp, ownerRowCounts } from '../../../scripts/scaling/cleanup'
import { measuredDb } from '../../../scripts/scaling/d1Adapter'
import { SYNTHETIC_OWNER } from '../../../scripts/scaling/guard'
import { renderRoutes } from '../../../scripts/scaling/report'
import { differences, fingerprintOthers } from '../../../scripts/scaling/snapshot'
import { sqliteTransport } from '../../../scripts/scaling/sqliteTransport'
import { MONTH, ledgerOf, seededDatabase } from '../../../scripts/scaling/testKit'
import { measureRoutes, READ_CASES, WRITE_CASES } from './routeMatrix'

const SIZE = 600

async function run(includeWrites: boolean) {
  const seeded = await seededDatabase(SIZE)
  const transport = sqliteTransport(seeded.db)
  const ledger = ledgerOf()
  const { db, recorder } = measuredDb({ transport, ledger, writesEnabled: includeWrites })
  const results = await measureRoutes({ db, recorder, owner: SYNTHETIC_OWNER, month: MONTH, includeWrites })
  return { ...seeded, transport, ledger, results, recorder }
}

describe('the route matrix, over a seeded database', () => {
  it('answers every read route through the real middleware and handlers, writing nothing', async () => {
    const { results, db } = await run(false)
    expect(results.map((r) => r.name)).toEqual(READ_CASES.map((c) => c.name))
    for (const result of results) {
      expect(result.status, result.name).toBe(result.name.endsWith('304') ? 304 : 200)
      expect(result.unexpectedWrite, result.name).toBe(false)
      expect(result.summary.rowsWritten, result.name).toBe(0)
    }
    expect(Number((db.prepare('SELECT count(*) AS n FROM transactions WHERE owner = ?').get(SYNTHETIC_OWNER) as { n: number }).n)).toBeGreaterThan(SIZE * 0.9)
  })

  it('answers a repeat of the dataset read with a 304 after one statement', async () => {
    const { results } = await run(false)
    const first = results.find((r) => r.name === 'GET /api/expenses')
    const again = results.find((r) => r.name === 'GET /api/expenses, 304')
    expect(again?.bytes).toBe(0)
    expect(again?.summary.statements).toBe(1)
    expect(first?.summary.statements).toBeGreaterThan(10)
  })

  it('keeps every read inside 50 D1 calls, whichever way a batch is counted', async () => {
    const { results } = await run(false)
    for (const result of results) {
      expect(result.summary.statements, result.name).toBeLessThanOrEqual(50)
      expect(result.summary.calls, result.name).toBeLessThanOrEqual(result.summary.statements)
    }
  })

  it('walks the pages: the second page starts where the first ended', async () => {
    const { results } = await run(false)
    const pages = results.filter((r) => r.name.startsWith('GET transactions/list'))
    expect(pages.map((p) => p.status)).toEqual([200, 200, 200])
  })

  it('runs the write routes on rows of its own, and every write binds the synthetic owner', async () => {
    const { results, recorder } = await run(true)
    expect(results.map((r) => r.name)).toEqual([...READ_CASES, ...WRITE_CASES].map((c) => c.name))
    for (const result of results.filter((r) => WRITE_CASES.some((c) => c.name === r.name))) {
      expect(result.status, result.name).toBeLessThan(300)
      expect(result.summary.writes, result.name).toBeGreaterThan(0)
    }
    expect(recorder.records.some((r) => r.write)).toBe(true)
  })

  it('reports the cost of a bulk import in statements, so the 50 query limit can be checked', async () => {
    const { results } = await run(true)
    const bulk = results.find((r) => r.name === 'POST transactions/bulk, 20 rows')
    expect(bulk?.summary.statements).toBeGreaterThan(50)
    expect(bulk?.summary.calls).toBeGreaterThan(50)
  })

  it('attributes every statement, row read and row written of a route to a distinct SQL text', async () => {
    const { results } = await run(true)
    for (const result of results) {
      const { statements, summary } = result
      expect(statements.reduce((sum, s) => sum + s.runs, 0), result.name).toBe(summary.statements)
      expect(statements.reduce((sum, s) => sum + s.rowsRead, 0), result.name).toBe(summary.rowsRead)
      expect(statements.reduce((sum, s) => sum + s.rowsWritten, 0), result.name).toBe(summary.rowsWritten)
    }
    const bulk = results.find((r) => r.name === 'POST transactions/bulk, 20 rows')
    expect(bulk?.statements.length).toBeLessThan(bulk?.summary.statements ?? 0)
    expect(JSON.stringify(results)).not.toContain(SYNTHETIC_OWNER)
  })

  it('stops at the first route that fails, since later ones lean on its answer', async () => {
    const seeded = await seededDatabase(200)
    const { db, recorder } = measuredDb({ transport: sqliteTransport(seeded.db), ledger: ledgerOf(), writesEnabled: false })
    const results = await measureRoutes({ db, recorder, owner: 'not-seeded@example.com', month: MONTH, includeWrites: false })
    expect(results.at(-1)?.status).toBeGreaterThanOrEqual(400)
    expect(results.length).toBeLessThan(READ_CASES.length)
  })

  it('prints a table with one line per route', async () => {
    const { results } = await run(false)
    const lines = renderRoutes(results)
    expect(lines).toHaveLength(results.length + 1)
    expect(lines[0]).toContain('route')
  })
})

describe('a whole run, start to finish', () => {
  it('leaves the database as it found it: nothing of the synthetic owner, nothing else changed', async () => {
    const { results, transport, ledger, before, db } = await run(true)
    expect(results.every((r) => r.status < 400)).toBe(true)

    await cleanUp(transport, ledger)
    const left = await ownerRowCounts(sqliteTransport(db), ledger)
    expect(Object.entries(left).filter(([, n]) => n > 0)).toEqual([])
    expect(differences(before, await fingerprintOthers(sqliteTransport(db), ledgerOf()))).toEqual([])
  })
})
