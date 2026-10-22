// @vitest-environment node
/**
 * The browser's bulk writes, end to end: `apiDataSource` sending through the real auth middleware, revision
 * bumps, the bulk routes and the D1 adapter on SQLite with the real migrations. What is checked is what the
 * database holds afterwards and which requests the browser made to get there.
 */
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiDataSource } from '../../../src/data/apiDataSource'
import { ApiError } from '../../../src/data/apiClient'
import { LedgerSession } from '../../../src/data/ledgerSession'
import { TransactionPager } from '../../../src/data/transactionPager'
import { HYDRATED_DATA_MONTHS, type HydrationPolicy } from '../../../src/domain/ledger'
import { patchAfterBulkDelete, patchAfterBulkUpdate } from '../../../src/ui/datasetPatches'
import { BULK_REVISION_MESSAGE } from '../../../src/domain/data/bulkEdit'
import type { MatchingTarget } from '../../../src/domain/data/dataSource'
import type { TxnFilter } from '../../../src/domain/engine/transactions'
import { seedDataset } from '../../../src/testing/seedSqlite'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { syntheticLedger } from '../../../src/testing/syntheticLedger'
import { OWNER, createExpenseWorld, pinClock, type Handler, type World } from '../../_shared/testing/expenseWorld'
import { onRequestGet as getCube } from './cube'
import { onRequestGet as getReference } from './reference'
import { onRequestPut as putSettings } from './settings/index'
import { onRequestGet as getList } from './transactions/list'
import { onRequestGet as getMonths } from './transactions/months'
import { onRequestDelete as deleteBulk, onRequestPatch as patchBulk } from './transactions/bulk'
import { onRequestPost as postLabels } from './transactions/bulk/labels'
import { onRequestGet as getSummary } from './transactions/summary'

const source = apiDataSource as Required<typeof apiDataSource>

interface Sent {
  method: string
  path: string
  body: Record<string, unknown>
}

let sqlite: DatabaseSync
let world: World
let sent: Sent[]
/** Runs after the browser's request number `at` (from zero) has been answered, as another tab would. */
let afterRequest: Array<[at: number, run: () => Promise<unknown>]>

/** Routes the browser's requests to the handlers, the way Pages does. */
function routeFetch() {
  const handlers: Array<[string, string, Handler]> = [
    ['/api/expenses/transactions/bulk', 'DELETE', deleteBulk],
    ['/api/expenses/transactions/bulk', 'PATCH', patchBulk],
    ['/api/expenses/transactions/bulk/labels', 'POST', postLabels],
    ['/api/expenses/transactions/summary', 'GET', getSummary],
    ['/api/expenses/transactions/months', 'GET', getMonths],
    ['/api/expenses/transactions/list', 'GET', getList],
    ['/api/expenses/reference', 'GET', getReference],
    ['/api/expenses/cube', 'GET', getCube],
  ]
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), 'https://expenses.test')
    const method = init?.method ?? 'GET'
    const handler = handlers.find(([path, verb]) => path === url.pathname && verb === method)?.[2]
    if (!handler) throw new Error(`no route for ${method} ${url.pathname}`)
    const at = sent.length
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
    sent.push({ method, path: url.pathname, body })
    const response = await world.call(handler, {
      method,
      path: `${url.pathname.slice('/api/expenses'.length)}${url.search}`,
      ...(init?.body ? { body } : {}),
    })
    for (const [when, run] of afterRequest) if (when === at) await run()
    return response
  }
}

const ids = (where = '1 = 1'): number[] =>
  (sqlite.prepare(`SELECT id FROM transactions WHERE owner = ? AND ${where} ORDER BY id`).all(OWNER) as Array<{ id: number }>).map(
    (row) => row.id,
  )

const count = (table: string, where = '1 = 1'): number =>
  (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE owner = ? AND ${where}`).get(OWNER) as { n: number }).n

const labelCount = (labelId: number): number =>
  (sqlite.prepare('SELECT COUNT(*) AS n FROM transaction_labels WHERE label_id = ?').get(labelId) as { n: number }).n

async function look(filter: TxnFilter): Promise<MatchingTarget> {
  const response = await world.call(getSummary, { path: `/transactions/summary?categoryId=${filter.categoryId}` })
  const summary = (await response.json()) as { count: number; revision: string }
  return { filter, expectedCount: summary.count, expectedRevision: summary.revision }
}

beforeEach(() => {
  pinClock('2026-10-15')
  sqlite = migratedDatabase()
  sqlite.exec('PRAGMA foreign_keys = OFF')
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  seedDataset(sqlite, OWNER, syntheticLedger({ months: 30, perMonth: 50, seed: 1 }))
  sent = []
  afterRequest = []
  vi.stubGlobal('fetch', routeFetch())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('bulk writes larger than a request', () => {
  it('deletes more rows than one request may name, in requests of at most 500', async () => {
    const all = ids()
    expect(all.length).toBeGreaterThan(1_203)
    const doomed = all.slice(0, 1_203)

    const result = await source.deleteTransactions(doomed)

    expect(result).toEqual({ deleted: 1_203, requested: 1_203 })
    expect(sent.map((request) => (request.body.ids as number[]).length)).toEqual([500, 500, 203])
    expect(ids()).toEqual(all.slice(1_203))
  })

  it('says how far a delete got when a later request fails, because the earlier ones stay written', async () => {
    const all = ids()
    afterRequest.push([0, async () => vi.stubGlobal('fetch', async () => new Response('{"error":"Database is busy"}', { status: 500 }))])

    await expect(source.deleteTransactions(all.slice(0, 1_203))).rejects.toThrow(
      '500 of 1,203 were done before this failed: Database is busy',
    )

    expect(ids()).toHaveLength(all.length - 500)
  })

  it('edits more rows than one request may name and answers every row it changed', async () => {
    const all = ids()
    const category = (sqlite.prepare('SELECT id FROM categories WHERE owner = ? ORDER BY id DESC LIMIT 1').get(OWNER) as { id: number }).id
    const edited = all.slice(0, 1_100)

    const result = await source.updateTransactions(edited, { categoryId: category })

    expect(result.updated).toBe(1_100)
    expect(result.transactions.map((row) => row.id).sort((a, b) => a - b)).toEqual(edited)
    expect(sent).toHaveLength(3)
    expect(ids(`category_id = ${category}`).filter((id) => edited.includes(id))).toEqual(edited)
  })

  it('adds labels to rows without taking the ones they have, in requests that hold the link bound', async () => {
    const [first, second] = (sqlite.prepare('SELECT id FROM labels WHERE owner = ? ORDER BY id').all(OWNER) as Array<{ id: number }>).map(
      (row) => row.id,
    ) as [number, number]
    const rows = ids().slice(0, 600)
    const before = labelCount(first)

    const result = await source.addLabelsToTransactions(rows, [first, second])

    expect(result.matched).toBe(600)
    expect(labelCount(second)).toBeGreaterThanOrEqual(600)
    expect(labelCount(first)).toBeGreaterThanOrEqual(before)
    // Two labels on up to 500 rows is under the 5,000 links a request may add: 500 and 100.
    expect(sent.map((request) => (request.body.ids as number[]).length)).toEqual([500, 100])
    // 20 labels leave room for 250 rows a request.
    sent = []
    await source.addLabelsToTransactions(rows, Array.from({ length: 20 }, () => first))
    expect(sent.map((request) => (request.body.ids as number[]).length)).toEqual([250, 250, 100])
  })
})

describe('an edit on the rows a filter matches', () => {
  const categoryOf = (): number => (sqlite.prepare('SELECT category_id AS id FROM transactions WHERE owner = ? GROUP BY category_id ORDER BY COUNT(*) DESC LIMIT 1').get(OWNER) as { id: number }).id
  const otherCategory = (than: number): number => (sqlite.prepare('SELECT id FROM categories WHERE owner = ? AND id <> ? ORDER BY id LIMIT 1').get(OWNER, than) as { id: number }).id

  it('adds the labels first and the edit second, with the revision the labels left', async () => {
    const category = categoryOf()
    const target = await look({ categoryId: category })
    const matching = ids(`category_id = ${category}`)
    const [label] = (sqlite.prepare('SELECT id FROM labels WHERE owner = ? ORDER BY id').all(OWNER) as Array<{ id: number }>).map((row) => row.id) as [number]
    const to = otherCategory(category)

    const result = await source.updateMatchingTransactions(target, { categoryId: to }, [label])

    expect(result).toEqual({ updated: target.expectedCount })
    expect(sent.map((request) => request.path)).toEqual([
      '/api/expenses/transactions/bulk/labels',
      '/api/expenses/transactions/summary',
      '/api/expenses/transactions/bulk',
    ])
    expect(sent[0]!.body.expectedRevision).toBe(target.expectedRevision)
    // The labels were a write, so the edit could only go with the revision read after them.
    expect(sent[2]!.body.expectedRevision).not.toBe(target.expectedRevision)
    expect(ids(`category_id = ${to}`)).toEqual(expect.arrayContaining(matching))
    expect(labelCount(label)).toBeGreaterThanOrEqual(matching.length)
  })

  it('sends only the edit when there are no labels, and only the labels when there is no edit', async () => {
    const category = categoryOf()
    const to = otherCategory(category)
    await source.updateMatchingTransactions(await look({ categoryId: category }), { categoryId: to })
    expect(sent.map((request) => request.method)).toEqual(['PATCH'])

    sent = []
    const [label] = (sqlite.prepare('SELECT id FROM labels WHERE owner = ?').all(OWNER) as Array<{ id: number }>).map((row) => row.id) as [number]
    await source.updateMatchingTransactions(await look({ categoryId: to }), {}, [label])
    expect(sent.map((request) => request.path)).toEqual(['/api/expenses/transactions/bulk/labels'])
  })

  it('is refused with a 409 and changes nothing when the ledger was written to since the count was read', async () => {
    const category = categoryOf()
    const target = await look({ categoryId: category })
    await world.call(putSettings, { method: 'PUT', path: '/settings', body: { currency: 'EUR' } })

    const refused = await source.updateMatchingTransactions(target, { categoryId: otherCategory(category) }).catch((e: unknown) => e)

    expect(refused).toBeInstanceOf(ApiError)
    expect((refused as ApiError).status).toBe(409)
    expect((refused as ApiError).message).toBe(BULK_REVISION_MESSAGE)
    expect(ids(`category_id = ${category}`)).toHaveLength(target.expectedCount)
  })

  it('stops after the labels when the rows are no longer the ones that were shown, and says so', async () => {
    const category = categoryOf()
    const target = await look({ categoryId: category })
    const [label] = (sqlite.prepare('SELECT id FROM labels WHERE owner = ?').all(OWNER) as Array<{ id: number }>).map((row) => row.id) as [number]
    // Another tab deletes a matching row between the labels and the edit.
    const gone = ids(`category_id = ${category}`)[0]!
    afterRequest.push([0, () => world.call(deleteBulk, { method: 'DELETE', path: '/transactions/bulk', body: { ids: [gone] } })])

    const failure = await source
      .updateMatchingTransactions(target, { categoryId: otherCategory(category) }, [label])
      .catch((e: unknown) => e)

    expect((failure as Error).message).toContain(`${target.expectedCount - 1} transactions match now, not the ${target.expectedCount} you were shown`)
    expect(sent.map((request) => request.path)).not.toContain('/api/expenses/transactions/bulk')
    expect(count('transactions', `category_id = ${category}`)).toBe(target.expectedCount - 1)
  })
})

describe('a ledger held as a window, after a write to months it holds only as sums', () => {
  const WINDOWED: HydrationPolicy = { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS }
  const wait = { timeout: 5_000, interval: 25 }

  const cellsOf = (session: LedgerSession) => session.getState().held!.cells

  async function opened(): Promise<LedgerSession> {
    const session = new LedgerSession(apiDataSource as Required<typeof apiDataSource>, { policy: WINDOWED })
    await session.open()
    return session
  }

  /** The sums a browser would open on now. */
  async function truth() {
    const fresh = await opened()
    return cellsOf(fresh)
  }

  /** Rows of months the session holds no rows for, oldest first. */
  function unheld(session: LedgerSession, n: number): number[] {
    const held = session.getState().held!
    const months = new Set(held.rows.keys())
    const rows = sqlite.prepare('SELECT id, budget_month AS month FROM transactions WHERE owner = ? ORDER BY id').all(OWNER) as Array<{ id: number; month: string }>
    return rows.filter((row) => !months.has(row.month) && !held.pinned.some((p) => p.id === row.id)).slice(0, n).map((row) => row.id)
  }

  const category = (): number => (sqlite.prepare('SELECT id FROM categories WHERE owner = ? ORDER BY id DESC LIMIT 1').get(OWNER) as { id: number }).id

  const writes: Array<[string, (session: LedgerSession, rows: number[], reach: boolean) => Promise<void>]> = [
    [
      'an edit by id',
      async (session, rows, reach) => {
        const patch = { categoryId: category() }
        const result = await source.updateTransactions(rows, patch)
        session.patch((d) => patchAfterBulkUpdate(d, result.transactions), reach ? { ids: rows, patch } : undefined)
      },
    ],
    [
      'a delete by id',
      async (session, rows, reach) => {
        await source.deleteTransactions(rows)
        session.patch((d) => patchAfterBulkDelete(d, rows), reach ? { ids: rows } : undefined)
      },
    ],
    [
      'an edit on a filter',
      async (session, rows, reach) => {
        const patch = { categoryId: category() }
        const old = (sqlite.prepare('SELECT category_id AS id FROM transactions WHERE id = ?').get(rows[0]!) as { id: number }).id
        await source.updateMatchingTransactions(await look({ categoryId: old }), patch)
        session.patch((d) => d, reach ? { patch } : undefined)
      },
    ],
  ]

  it.each(writes)('has the sums of the months %s reached, once it reads again', async (_name, write) => {
    const session = await opened()
    await write(session, unheld(session, 40), true)

    await vi.waitFor(async () => expect(cellsOf(session)).toEqual(await truth()), wait)
  })

  it.each(writes)('keeps the old sums of those months after %s when nothing says the write went past the rows it holds', async (_name, write) => {
    const session = await opened()
    const before = cellsOf(session)
    await write(session, unheld(session, 40), false)
    await new Promise((resolve) => setTimeout(resolve, 150))

    expect(cellsOf(session)).toEqual(before)
    expect(before).not.toEqual(await truth())
  })
})

describe('a list read in pages, after an edit on the filter it shows', () => {
  it('offers the filter as it was read, and shows what the edit moved once it reads again', async () => {
    const category = (sqlite.prepare('SELECT category_id AS id FROM transactions WHERE owner = ? GROUP BY category_id ORDER BY COUNT(*) DESC LIMIT 1').get(OWNER) as { id: number }).id
    const to = (sqlite.prepare('SELECT id FROM categories WHERE owner = ? AND id <> ? ORDER BY id LIMIT 1').get(OWNER, category) as { id: number }).id
    const pager = new TransactionPager(source, { limit: 100 })
    pager.attach()
    pager.setFilter({ categoryId: category })
    await vi.waitFor(() => expect(pager.matching()).not.toBeNull(), { timeout: 5_000 })
    const target = pager.matching()!
    expect(pager.getState().rows).toHaveLength(100)
    expect(target.expectedCount).toBeGreaterThan(100)

    await source.updateMatchingTransactions(target, { categoryId: to })
    pager.refresh({ summary: true })

    await vi.waitFor(() => expect(pager.getState().summary?.count).toBe(0), { timeout: 5_000 })
    expect(pager.getState().rows).toHaveLength(0)
    expect(ids(`category_id = ${to}`).length).toBeGreaterThanOrEqual(target.expectedCount)
  })
})
