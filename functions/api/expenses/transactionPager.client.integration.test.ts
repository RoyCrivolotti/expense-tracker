// @vitest-environment node
/**
 * The browser's paged list, end to end: `TransactionPager` reading through `apiDataSource` and the real
 * auth middleware, the list and summary routes and the D1 adapter's SQL on SQLite with the real migrations.
 * What it holds is compared with the engine's own filter over the dataset the same database serves.
 */
import type { DatabaseSync } from 'node:sqlite'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiDataSource } from '../../../src/data/apiDataSource'
import { TransactionPager, type PagerState } from '../../../src/data/transactionPager'
import { summaryOf } from '../../../src/domain/data/transactionQueryOf'
import { mulberry32 } from '../../../src/domain/engine/rng'
import { filterTransactions, type TxnFilter } from '../../../src/domain/engine/transactions'
import type { ExpenseDataset, Transaction } from '../../../src/domain/types'
import { adversarialLedger } from '../../../src/testing/adversarialLedger'
import { randomLedger } from '../../../src/testing/randomLedger'
import { seedDataset } from '../../../src/testing/seedSqlite'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { awkwardLedger, filterStream, vocabularyOf, withSortedLabels } from '../../../src/testing/transactionQueryKit'
import { OWNER, createExpenseWorld, pinClock, type Handler, type World } from '../../_shared/testing/expenseWorld'
import { onRequestGet as getDataset } from './index'
import { onRequestGet as getList } from './transactions/list'
import { onRequestGet as getSummary } from './transactions/summary'

const SLOW = 60_000

interface Served {
  name: string
  sqlite: DatabaseSync
  world: World
  /** What GET /api/expenses serves. */
  dataset: ExpenseDataset
}

const cases: Served[] = []
/** The ledger the tests that change a row work on. */
let main: Served

/** Routes the browser's requests to the handlers, the way Pages does; `tamper` may rewrite a request first. */
function routeFetch({ world }: Served, tamper: (url: URL, call: number) => void = () => undefined) {
  const handlers: Array<[string, Handler]> = [
    ['/api/expenses/transactions/list', getList],
    ['/api/expenses/transactions/summary', getSummary],
  ]
  let call = 0
  return async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input), 'https://expenses.test')
    tamper(url, call++)
    const handler = handlers.find(([path]) => path === url.pathname)?.[1]
    if (!handler) return new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })
    return world.call(handler, { path: `${url.pathname.slice('/api/expenses'.length)}${url.search}` })
  }
}

const source = apiDataSource as Required<typeof apiDataSource>

/** A pager with a screen attached to it, as the Transactions tab is while it is open. */
function pagerOf(options: ConstructorParameters<typeof TransactionPager>[1]): TransactionPager {
  const pager = new TransactionPager(source, options)
  pager.attach()
  return pager
}

function settled(pager: TransactionPager): Promise<PagerState> {
  return new Promise((resolve) => {
    const check = () => {
      const { loading, refreshing } = pager.getState()
      if (loading || refreshing) return
      off()
      resolve(pager.getState())
    }
    const off = pager.subscribe(check)
    check()
  })
}

async function drain(pager: TransactionPager): Promise<PagerState> {
  for (let guard = 0; guard < 10_000; guard += 1) {
    const state = await settled(pager)
    if (state.complete || state.error !== null) return state
    pager.loadMore()
  }
  throw new Error('the pager never finished')
}

const expected = (c: Served, filter: TxnFilter): Transaction[] =>
  filterTransactions(c.dataset.transactions, filter).map(withSortedLabels)

async function serve(name: string, dataset: ExpenseDataset): Promise<Served> {
  const sqlite = migratedDatabase()
  sqlite.exec('PRAGMA foreign_keys = OFF')
  seedDataset(sqlite, OWNER, dataset)
  const world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  return { name, sqlite, world, dataset: (await (await world.call(getDataset)).json()) as ExpenseDataset }
}

beforeAll(async () => {
  // Before any plan falls due, so that reading never inserts an instalment.
  pinClock('2020-01-15')
  main = await serve('awkward', awkwardLedger())
  cases.push(main, await serve('adversarial', adversarialLedger()), await serve('random', randomLedger(5)))
}, SLOW)

afterAll(() => {
  vi.useRealTimers()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('a list read in pages from the routes', () => {
  it('holds the rows the engine lists for random filters, with the count and net spend beside them', async () => {
    for (const c of cases) {
      vi.stubGlobal('fetch', routeFetch(c))
      for (const [at, filter] of [{}, ...filterStream(vocabularyOf(c.dataset), 25, 4242)].entries()) {
        const pager = pagerOf({ limit: [13, 100, 200][at % 3]! })
        pager.setFilter(filter)
        const state = await drain(pager)
        expect(state.rows.map(withSortedLabels), `${c.name} ${JSON.stringify(filter)}`).toEqual(expected(c, filter))
        await vi.waitFor(() => expect(pager.getState().summary).not.toBeNull())
        expect(pager.getState().summary).toMatchObject({
          ...summaryOf(c.dataset.transactions, filter),
          revision: c.world.token(),
        })
      }
    }
  }, SLOW)

  it('holds a row once when it is edited to an older day between two pages', async () => {
    vi.stubGlobal('fetch', routeFetch(main))
    const { sqlite } = main
    const pager = pagerOf({ limit: 25 })
    pager.setFilter({})
    const first = await settled(pager)
    const moved = first.rows[3]!
    const older = main.dataset.transactions[300]!
    sqlite.prepare('UPDATE transactions SET date = ? WHERE id = ?').run(older.date, moved.id)
    try {
      const rows = (await drain(pager)).rows
      expect(new Set(rows.map((t) => t.id)).size).toBe(rows.length)
      expect(rows.find((t) => t.id === moved.id)?.date).toBe(older.date)
      expect(rows.filter((t) => t.id !== moved.id).map((t) => t.id)).toEqual(
        main.dataset.transactions.filter((t) => t.id !== moved.id).map((t) => t.id),
      )
    } finally {
      sqlite.prepare('UPDATE transactions SET date = ? WHERE id = ?').run(moved.date, moved.id)
    }
  }, SLOW)

  it('reports the server refusing a cursor, and reads the list again from the start to recover', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch(main, (url) => {
        const cursor = url.searchParams.get('cursor')
        if (cursor) url.searchParams.set('cursor', `${cursor}x`)
      }),
    )
    const pager = pagerOf({ limit: 40 })
    pager.setFilter({ status: 'posted' })
    const state = await drain(pager)
    expect(state.error).toMatch(/cursor/i)
    expect(state.rows).toHaveLength(40)
    vi.stubGlobal('fetch', routeFetch(main))
    pager.refresh()
    expect((await drain(pager)).rows.map(withSortedLabels)).toEqual(expected(main, { status: 'posted' }))
  }, SLOW)

  it('starts a new filter at its first page, never at the cursor of the one before', async () => {
    const seen: string[] = []
    vi.stubGlobal('fetch', routeFetch(main, (url) => seen.push(url.search)))
    const pager = pagerOf({ limit: 30 })
    pager.setFilter({ status: 'posted' })
    await settled(pager)
    const before = seen.length
    pager.setFilter({ status: 'forecast' })
    await drain(pager)
    const pages = seen.slice(before).filter((search) => search.includes('limit='))
    expect(pages.length).toBeGreaterThan(1)
    expect(pages.every((search) => search.includes('status=forecast'))).toBe(true)
    expect(pages[0]).not.toContain('cursor=')
  }, SLOW)

  it('cancels the read of a filter that was replaced, through the fetch', async () => {
    const route = routeFetch(main)
    const signals: AbortSignal[] = []
    vi.stubGlobal('fetch', (input: string, init: RequestInit) => {
      signals.push(init.signal!)
      if (signals.length > 1) return route(input)
      // The first page hangs until it is cancelled, as a slow one would.
      return new Promise<Response>((_, reject) =>
        init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
      )
    })
    const pager = pagerOf({ limit: 40 })
    pager.setFilter({ status: 'posted' })
    await vi.waitFor(() => expect(signals).toHaveLength(2))
    pager.setFilter({ status: 'forecast' })
    expect(signals[0]!.aborted && signals[1]!.aborted).toBe(true)
    const state = await drain(pager)
    expect(state.error).toBeNull()
    expect(state.rows.map(withSortedLabels)).toEqual(expected(main, { status: 'forecast' }))
  }, SLOW)
})

describe('a list read in pages while the ledger is written to', () => {
  it('is the list the engine makes after a refresh, however rows were moved and deleted behind the cursor', async () => {
    const walked = await serve('walk', awkwardLedger())
    vi.stubGlobal('fetch', routeFetch(walked))
    const rnd = mulberry32(20261022)
    const pick = <T,>(items: T[]): T => items[Math.floor(rnd() * items.length)]!
    let behind = 0
    for (let walk = 0; walk < 15; walk += 1) {
      const pager = pagerOf({ limit: 20 + Math.floor(rnd() * 80) })
      pager.setFilter({})
      await settled(pager)
      for (let more = Math.floor(rnd() * 3); more > 0; more -= 1) {
        pager.loadMore()
        await settled(pager)
      }
      const before = (await (await walked.world.call(getDataset)).json()) as ExpenseDataset
      for (let edit = 1 + Math.floor(rnd() * 4); edit > 0; edit -= 1) {
        // Half the edits land in the rows already read, behind the cursor, and half anywhere in the ledger.
        const read = [...pager.getState().rows]
        const [row, other] = [pick(rnd() < 0.5 ? read : before.transactions), pick(before.transactions)]
        if (rnd() < 0.3) walked.sqlite.prepare('DELETE FROM transactions WHERE id = ?').run(row.id)
        else walked.sqlite.prepare('UPDATE transactions SET date = ? WHERE id = ?').run(other.date, row.id)
      }
      const truth = (await (await walked.world.call(getDataset)).json()) as ExpenseDataset
      const wanted = filterTransactions(truth.transactions, {}).map(withSortedLabels)
      const unrefreshed = (await drain(pager)).rows.map((t) => t.id)
      if (unrefreshed.join() !== wanted.map((t) => t.id).join()) behind += 1
      pager.refresh({ summary: true })
      const refreshed = await drain(pager)
      expect(refreshed.rows.map(withSortedLabels), `walk ${walk}`).toEqual(wanted)
      await vi.waitFor(() => expect(pager.getState().summary).toMatchObject({ netSpendCents: summaryOf(truth.transactions, {}).netSpendCents }))
      expect(pager.getState().summaryStale).toBe(false)
    }
    // Paging by position cannot see a row that moved behind the cursor: that is why a screen refreshes after a write.
    expect(behind).toBeGreaterThan(0)
  }, SLOW)
})
