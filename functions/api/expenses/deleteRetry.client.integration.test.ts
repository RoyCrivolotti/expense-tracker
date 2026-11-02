// @vitest-environment jsdom
/**
 * A delete the server committed whose answer never arrived, end to end: the actions a screen calls, the real data
 * source, the auth middleware, the delete route and the D1 adapter's SQL on SQLite with the real migrations. Chrome sends
 * such a delete again by itself and the app sees only the repeat; Safari fails the request and the person tries again.
 * Either way the repeat finds the row gone, and what the screen shows afterwards has to be what a screen opened now
 * would show, in a ledger read in pages and in the classic dataset held in full.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiDataSource } from '../../../src/data/apiDataSource'
import { apiLedgerParts } from '../../../src/data/apiLedgerParts'
import { applyWrite } from '../../../src/data/applyWrite'
import { LedgerSession } from '../../../src/data/ledgerSession'
import { TransactionPager } from '../../../src/data/transactionPager'
import { sortedMonths } from '../../../src/domain/engine/dates'
import type { TxnFilter } from '../../../src/domain/engine/transactions'
import { HYDRATED_DATA_MONTHS, type HydrationPolicy } from '../../../src/domain/ledger'
import type { ExpenseDataset } from '../../../src/domain/types'
import { seedDataset } from '../../../src/testing/seedSqlite'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { syntheticLedger } from '../../../src/testing/syntheticLedger'
import { useExpenseActions } from '../../../src/ui/useExpenseActions'
import { OWNER, createExpenseWorld, pinClock, type Handler, type World } from '../../_shared/testing/expenseWorld'
import { onRequestGet as getCube } from './cube'
import { onRequestGet as getDataset } from './index'
import { onRequestGet as getReference } from './reference'
import { onRequestGet as getList } from './transactions/list'
import { onRequestGet as getMonths } from './transactions/months'
import { onRequestGet as getSummary } from './transactions/summary'
import { onRequestDelete as deleteOne } from './transactions/[id]'

const WINDOWED: HydrationPolicy = { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS }

/** What happens to the next delete the browser sends, after the server has committed it. */
type Fate = 'answered' | 'repeated by the browser' | 'answer lost'

let world: World
let fate: Fate

function routeFetch() {
  const reads: Array<[string, Handler]> = [
    ['/api/expenses', getDataset],
    ['/api/expenses/transactions/months', getMonths],
    ['/api/expenses/transactions/list', getList],
    ['/api/expenses/transactions/summary', getSummary],
    ['/api/expenses/reference', getReference],
    ['/api/expenses/cube', getCube],
  ]
  const call = (handler: Handler, url: URL, method: string, params?: Record<string, string>) =>
    world.call(handler, { method, path: `${url.pathname.slice('/api/expenses'.length)}${url.search}`, ...(params ? { params } : {}) })
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), 'https://expenses.test')
    const method = init?.method ?? 'GET'
    const id = /^\/api\/expenses\/transactions\/(\d+)$/.exec(url.pathname)?.[1]
    if (method === 'DELETE' && id) {
      const answer = await call(deleteOne, url, method, { id })
      if (fate === 'answered') return answer
      const was = fate
      fate = 'answered'
      if (was === 'answer lost') throw new TypeError('Load failed')
      return call(deleteOne, url, method, { id })
    }
    const handler = reads.find(([path]) => path === url.pathname)?.[1]
    if (!handler || method !== 'GET') throw new Error(`no route for ${method} ${url.pathname}`)
    return call(handler, url, method)
  }
}

/** What a screen shows of the transactions: the rows, and the count the summary above them gives. */
interface Shown {
  ids: number[]
  count: number
}

interface Client {
  /** The delete a screen calls, from the actions the app hands it. */
  remove(id: number): Promise<void>
  shown(): Promise<Shown>
  /** What a screen opened now would show. */
  fresh(): Promise<Shown>
}

const byId = (ids: number[]): number[] => [...ids].sort((a, b) => a - b)

/** The classic client: the whole dataset held, patched by what each write answered. */
async function classicClient(): Promise<Client> {
  let held = await apiDataSource.load()
  const { result } = renderHook(() =>
    useExpenseActions(apiDataSource, (patch) => {
      held = patch(held)
    }, vi.fn()),
  )
  const of = (dataset: ExpenseDataset): Shown => ({ ids: byId(dataset.transactions.map((t) => t.id)), count: dataset.transactions.length })
  return {
    remove: (id) => act(() => result.current!.deleteTransaction(id)),
    shown: () => Promise.resolve(of(held)),
    fresh: async () => of(await apiDataSource.load()),
  }
}

/** The list a screen shows once it has read every page and the figures above it. */
async function listShown(pager: TransactionPager): Promise<Shown> {
  const idle = () => {
    const state = pager.getState()
    expect(state.loading || state.refreshing || state.summaryStale).toBe(false)
  }
  await vi.waitFor(idle)
  while (!pager.getState().complete) {
    pager.loadMore()
    await vi.waitFor(idle)
  }
  const { rows, summary } = pager.getState()
  return { ids: byId(rows.map((row) => row.id)), count: summary!.count }
}

/** The ledger client: rows held as a window and the list read in pages, read again after each write as the app does. */
async function ledgerClient(filter: TxnFilter): Promise<Client> {
  const session = new LedgerSession(apiLedgerParts, { policy: WINDOWED })
  await session.open()
  const pager = new TransactionPager(apiLedgerParts)
  pager.attach()
  pager.setFilter(filter)
  let writing: Promise<unknown> = Promise.resolve()
  const { result } = renderHook(() =>
    useExpenseActions(
      apiDataSource,
      (patch, reach) => {
        writing = applyWrite(session, pager, patch, reach)
      },
      vi.fn(),
    ),
  )
  return {
    remove: async (id) => {
      await act(() => result.current!.deleteTransaction(id))
      await writing
    },
    shown: () => listShown(pager),
    fresh: async () => {
      const other = new TransactionPager(apiLedgerParts)
      other.attach()
      other.setFilter(filter)
      return listShown(other)
    },
  }
}

const LEDGER = syntheticLedger({ months: 12, perMonth: 10, seed: 1, endMonth: '2026-08' })
const months = sortedMonths(LEDGER.transactions.map((t) => t.budgetMonth))
/** Four months of the ledger: short enough to be read in a few pages, long enough to have rows to spare. */
const FILTER: TxnFilter = { dateFrom: `${months[months.length - 4]!}-01`, dateTo: `${months[months.length - 1]!}-31` }

beforeEach(() => {
  pinClock('2026-08-20')
  const sqlite = migratedDatabase()
  sqlite.exec('PRAGMA foreign_keys = OFF')
  seedDataset(sqlite, OWNER, LEDGER)
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  fate = 'answered'
  vi.stubGlobal('fetch', routeFetch())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe.each([
  ['classic', () => classicClient()],
  ['ledger mode', () => ledgerClient(FILTER)],
] as const)('a delete repeated after its answer was lost, in %s', (_mode, connect) => {
  it.each(['repeated by the browser', 'answer lost'] as const)('leaves what the screen shows as a fresh read does when it is %s', async (lost) => {
    const client = await connect()
    const before = await client.shown()
    expect(before.count).toBeGreaterThan(1)
    const id = before.ids[0]!

    fate = lost
    if (lost === 'answer lost') {
      await expect(client.remove(id)).rejects.toThrow('Load failed')
      // The server has the delete, the screen was never told: it still lists the row until the person tries again.
      expect((await client.shown()).ids).toContain(id)
    }
    await client.remove(id)

    const shown = await client.shown()
    expect(shown.ids).toEqual(before.ids.filter((other) => other !== id))
    expect(shown.count).toBe(before.count - 1)
    expect(shown).toEqual(await client.fresh())
  })

  it('does not count the row twice when the delete is made again after the screen has dropped it', async () => {
    const client = await connect()
    const before = await client.shown()
    expect(before.count).toBeGreaterThan(1)
    const id = before.ids[0]!

    await client.remove(id)
    await client.remove(id)

    const shown = await client.shown()
    expect(shown.ids).toEqual(before.ids.filter((other) => other !== id))
    expect(shown.count).toBe(before.count - 1)
    expect(shown).toEqual(await client.fresh())
  })
})
