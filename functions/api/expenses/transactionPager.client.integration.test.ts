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

function settled(pager: TransactionPager): Promise<PagerState> {
  return new Promise((resolve) => {
    const check = () => {
      if (pager.getState().loading) return
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
        const pager = new TransactionPager(source, [13, 100, 200][at % 3])
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
    const pager = new TransactionPager(source, 25)
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
    const pager = new TransactionPager(source, 40)
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
    const pager = new TransactionPager(source, 30)
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
})
