// @vitest-environment node
/**
 * GET /api/expenses/export through the real auth middleware and the D1 adapter on SQLite with the real
 * migrations: a body of NDJSON rows, the cursor and revision in headers, the refusals, and the promise that
 * it only reads.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { EXPORT_CHUNK_ROWS, EXPORT_FORMAT, EXPORT_TABLES } from '../../../src/domain/data/exportTables'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { loadDataset } from '../../_shared/db'
import { OTHER, OWNER, createExpenseWorld, pinClock, type World } from '../../_shared/testing/expenseWorld'
import { seedLedger } from '../../_shared/testing/seedLedger'
import { onRequestGet as getDataset } from './index'
import { onRequestGet as getExport } from './export'

let world: World
let sqlite: DatabaseSync

beforeEach(async () => {
  pinClock('2026-10-15')
  sqlite = migratedDatabase()
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  await seedLedger(world)
})

afterEach(() => {
  vi.useRealTimers()
})

const get = (query: string, email = OWNER) => world.call(getExport, { path: `/export?${query}`, email })
const lines = async (response: Response): Promise<unknown[]> =>
  (await response.text()).split('\n').filter(Boolean).map((line) => JSON.parse(line) as unknown)
const count = (table: string): number => (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n

describe('GET /export', () => {
  it('answers a chunk as NDJSON, one complete JSON row per line, with the table, format and revision in headers', async () => {
    const response = await get('table=transactions')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/x-ndjson; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-export-table')).toBe('transactions')
    expect(response.headers.get('x-export-format')).toBe(String(EXPORT_FORMAT))
    expect(response.headers.get('x-export-revision')).toBe(world.token())
    expect(response.headers.get('x-export-next')).toBeNull()
    const text = await response.clone().text()
    expect(text.endsWith('\n')).toBe(true)
    expect(text.split('\n').filter(Boolean).every((line) => !line.includes('\n'))).toBe(true)
    expect((await lines(response)).length).toBe(count('transactions'))
  })

  it('hands out the next position until the table is read, and the rows are the dataset’s', async () => {
    const want = (await loadDataset(world.env, OWNER)).transactions.map((t) => t.id).sort((a, b) => a - b)
    const got: number[] = []
    let after: string | null = null
    let requests = 0
    do {
      const response: Response = await get(`table=transactions&limit=2${after ? `&after=${after}` : ''}`)
      expect(response.status).toBe(200)
      got.push(...(await lines(response)).map((row) => (row as { id: number }).id))
      after = response.headers.get('x-export-next')
      requests += 1
    } while (after !== null && requests < 100)

    expect(got).toEqual(want)
    expect(requests).toBe(Math.ceil(want.length / 2))
  })

  it('answers an empty body for a table that has no rows, and for an owner who has none at all', async () => {
    const empty = await get('table=transactions', OTHER)

    expect(empty.status).toBe(200)
    expect(await empty.text()).toBe('')
    expect(empty.headers.get('x-export-next')).toBeNull()
    for (const table of EXPORT_TABLES) {
      expect(await (await get(`table=${table}`, OTHER)).text(), table).toBe('')
    }
  })

  it('reads every table of the ledger', async () => {
    for (const table of EXPORT_TABLES) {
      const response = await get(`table=${table}`)
      expect(response.status, table).toBe(200)
      if (table !== 'settings') expect((await lines(response)).length, table).toBeGreaterThan(0)
    }
  })

  it('is the owner’s rows only, whoever asks', async () => {
    const mine = (await lines(await get('table=transactions'))).map((r) => (r as { id: number }).id)
    sqlite.exec('PRAGMA foreign_keys = OFF')
    sqlite
      .prepare(
        `INSERT INTO transactions (owner,id,date,budget_month,description,account_id,category_id,type,amount_cents,cancelled)
         VALUES (?,9001,'2026-01-01','2026-01','Theirs',1,1,'expense',100,0)`,
      )
      .run(OTHER)

    expect((await lines(await get('table=transactions'))).map((r) => (r as { id: number }).id)).toEqual(mine)
    expect(await lines(await get('table=transactions', OTHER))).toHaveLength(1)
  })

  it('reads and writes nothing else: no new revision, and no instalment created', async () => {
    pinClock('2026-12-15')
    const token = world.token()
    const rows = count('transactions')

    await get('table=transactions')
    await get('table=installmentPlans')

    expect(world.token()).toBe(token)
    expect(count('transactions')).toBe(rows)
    await world.call(getDataset)
    expect(count('transactions')).toBeGreaterThan(rows)
  })

  it('stays inside a chunk’s bound however it is asked', async () => {
    const response = await get(`table=transactions&limit=${EXPORT_CHUNK_ROWS.transactions}`)

    expect(response.status).toBe(200)
    expect((await lines(response)).length).toBeLessThanOrEqual(EXPORT_CHUNK_ROWS.transactions)
  })

  it.each([
    ['no table', ''],
    ['an unknown table', 'table=users'],
    ['an unknown parameter', 'table=labels&owner=other@example.com'],
    ['a table given twice', 'table=labels&table=flags'],
    ['a position given twice', 'table=labels&after=1&after=2'],
    ['a position that is not one', 'table=labels&after=one'],
    ['a position on the settings', 'table=settings&after=1'],
    ['a limit of zero', 'table=labels&limit=0'],
    ['a limit over the bound', `table=transactions&limit=${EXPORT_CHUNK_ROWS.transactions + 1}`],
  ])('answers 400 for %s', async (_name, query) => {
    const response = await get(query)

    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toBeTruthy()
  })

  it('answers 401 with no signed-in user', async () => {
    const response = await world.call(getExport, { path: '/export?table=labels', email: '' })

    expect(response.status).toBe(401)
  })
})
