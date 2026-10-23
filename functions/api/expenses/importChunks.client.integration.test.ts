// @vitest-environment node
/**
 * The Settings import over the real routes: the browser's own request code, the auth middleware, the handler and the D1
 * adapter's SQL on SQLite with the real migrations. What matters is what each request costs the database, what is saved
 * when one fails, and that confirming again after a failure saves the rows that are left and no row twice.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiDataSource } from '../../../src/data/apiDataSource'
import type { NewTransaction } from '../../../src/domain/data/dataSource'
import { IMPORT_CHUNK, ImportStopped, importInChunks } from '../../../src/ui/settings/importInChunks'
import { seedDataset } from '../../../src/testing/seedSqlite'
import { migratedDatabase, newStats, sqliteD1, type SqliteD1Stats } from '../../../src/testing/sqliteD1'
import { syntheticLedger } from '../../../src/testing/syntheticLedger'
import { CAT, VISA } from '../../../src/testing/syntheticReference'
import { OWNER, createExpenseWorld, pinClock, type World } from '../../_shared/testing/expenseWorld'
import { onRequestPost as postBulk } from './transactions/bulk'

type Db = ReturnType<typeof migratedDatabase>

interface Sent {
  rows: number
  status: number
  statements: number
}

let sqlite: Db
let stats: SqliteD1Stats
let world: World
let sent: Sent[]
/** Runs after the handler answered, with the 1-based number of the request, and may fail the request after it was saved. */
let afterSaving: (request: number) => void

beforeEach(() => {
  pinClock('2026-08-20')
  sqlite = migratedDatabase()
  sqlite.exec('PRAGMA foreign_keys = OFF')
  seedDataset(sqlite, OWNER, syntheticLedger({ months: 2, perMonth: 4, seed: 1, endMonth: '2026-08' }))
  stats = newStats()
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, stats))
  sent = []
  afterSaving = () => undefined
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), 'https://expenses.test')
    if (url.pathname !== '/api/expenses/transactions/bulk' || init?.method !== 'POST') throw new Error(`no route for ${init?.method} ${url.pathname}`)
    const body = JSON.parse(String(init.body)) as { transactions: unknown[] }
    const before = stats.statements
    const response = await world.call(postBulk, { method: 'POST', path: '/transactions/bulk', body })
    sent.push({ rows: body.transactions.length, status: response.status, statements: stats.statements - before })
    afterSaving(sent.length)
    return response
  })
})
afterEach(() => vi.unstubAllGlobals())
afterAll(() => vi.useRealTimers())

const importRow = (n: number, over: Partial<NewTransaction> = {}): NewTransaction => ({
  date: '2026-08-05',
  budgetMonth: '2026-08',
  description: `Import ${n}`,
  accountId: VISA,
  categoryId: CAT.groceries,
  type: 'expense',
  amountCents: 100 + n,
  ...over,
})

const batch = (n: number, over: (i: number) => Partial<NewTransaction> = () => ({})): NewTransaction[] =>
  Array.from({ length: n }, (_, i) => importRow(i + 1, over(i + 1)))

/** The same way the section sends them. */
const send = (chunk: NewTransaction[]): Promise<void> => apiDataSource.createTransactions!(chunk).then(() => undefined)

const saved = (): string[] =>
  (sqlite.prepare("SELECT description FROM transactions WHERE owner = ? AND description LIKE 'Import %' ORDER BY id").all(OWNER) as { description: string }[]).map((r) => r.description)

describe('importing a file over the real routes', () => {
  it('saves 250 rows in three requests of at most a hundred, each a few hundred statements and not a thousand', async () => {
    await importInChunks(batch(250), send)
    expect(sent.map((s) => s.rows)).toEqual([100, 100, 50])
    expect(sent.every((s) => s.status === 201)).toBe(true)
    expect(saved()).toEqual(batch(250).map((r) => r.description))
    // A create is six statements a row and four a request.
    expect(Math.max(...sent.map((s) => s.statements))).toBeLessThanOrEqual(6 * IMPORT_CHUNK + 15)
  })

  it('would have run over a thousand statements in one request of 250, which is what the chunks are for', async () => {
    await send(batch(250))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.statements).toBeGreaterThan(1_400)
  })

  it('saves what was saved and says how many when a request is refused, and the refused request saved nothing', async () => {
    const rows = batch(250, (n) => (n === 130 ? { amountCents: -5 } : {}))
    const stopped = await importInChunks(rows, send).catch((error: unknown) => error)
    expect(stopped).toBeInstanceOf(ImportStopped)
    const error = stopped as ImportStopped
    expect(error.imported).toBe(100)
    expect(error.maybeSaved).toBe(false)
    expect(error.message).toMatch(/Imported 100 of 250 transactions\. The next 100 were refused and not saved: Row 130: /)
    expect(sent.map((s) => s.status)).toEqual([201, 400])
    expect(saved()).toEqual(batch(100).map((r) => r.description))
  })

  it('saves the rows that are left, and no row twice, when it is confirmed again after a refusal', async () => {
    const rows = batch(250, (n) => (n === 130 ? { amountCents: -5 } : {}))
    const stopped = (await importInChunks(rows, send).catch((error: unknown) => error)) as ImportStopped
    // The person fixes row 130 and confirms again: the section sends what is left, which is the rows from 101 on.
    const fixed = batch(250).slice(stopped.imported)
    await importInChunks(fixed, send)
    expect(saved()).toEqual(batch(250).map((r) => r.description))
    expect(new Set(saved()).size).toBe(250)
  })

  it('may leave a request saved that the browser never heard back from, which is what the message warns of', async () => {
    afterSaving = (request) => {
      if (request === 2) throw new TypeError('Failed to fetch')
    }
    const stopped = (await importInChunks(batch(250), send).catch((error: unknown) => error)) as ImportStopped
    expect(stopped).toBeInstanceOf(ImportStopped)
    expect(stopped.imported).toBe(100)
    expect(stopped.maybeSaved).toBe(true)
    expect(stopped.message).toContain('may or may not have been saved')
    // Request 2 was saved: confirming again for the rest as if it was not would put its rows in twice.
    expect(saved()).toHaveLength(200)
    expect(saved()).toEqual(batch(200).map((r) => r.description))
  })
})
