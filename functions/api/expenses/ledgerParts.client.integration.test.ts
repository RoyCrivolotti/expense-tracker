// @vitest-environment node
/**
 * The browser's reading of the ledger in parts, end to end: `apiDataSource` fetching the three routes
 * through the real auth middleware and the D1 adapter's SQL on SQLite with the real migrations, and
 * `loadLedger` putting what came back together. The ledger it builds is held to the one made from
 * `GET /api/expenses` over the same database, which is what a browser holds today.
 */
import type { DatabaseSync } from 'node:sqlite'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiDataSource } from '../../../src/data/apiDataSource'
import { loadLedger } from '../../../src/data/ledgerLoader'
import { PartsUnavailableError } from '../../../src/domain/data/ledgerPartsErrors'
import { sortedMonths } from '../../../src/domain/engine/dates'
import {
  HYDRATED_DATA_MONTHS,
  type HydrationPolicy,
  type Ledger,
  assembleRows,
  ledgerFor,
  ledgerMonths,
  ledgerRowCount,
} from '../../../src/domain/ledger'
import type { ExpenseDataset } from '../../../src/domain/types'
import { adversarialLedger } from '../../../src/testing/adversarialLedger'
import { comparable } from '../../../src/testing/ledgerSource'
import { randomLedger } from '../../../src/testing/randomLedger'
import { seedDataset } from '../../../src/testing/seedSqlite'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { syntheticLedger } from '../../../src/testing/syntheticLedger'
import { OWNER, createExpenseWorld, pinClock, type Handler, type World } from '../../_shared/testing/expenseWorld'
import { onRequestGet as getCube } from './cube'
import { onRequestGet as getDataset } from './index'
import { onRequestGet as getReference } from './reference'
import { onRequestGet as getMonths } from './transactions/months'

const SLOW = 60_000
const WINDOWED: HydrationPolicy = { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS }

interface Served {
  name: string
  sqlite: DatabaseSync
  world: World
  /** What GET /api/expenses serves. */
  dataset: ExpenseDataset
}

/** Routes the browser's requests to the handlers, the way Pages does. */
function routeFetch(world: World, seen: string[] = []) {
  const handlers: Array<[string, Handler]> = [
    ['/api/expenses/transactions/months', getMonths],
    ['/api/expenses/reference', getReference],
    ['/api/expenses/cube', getCube],
  ]
  return async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input), 'https://expenses.test')
    seen.push(url.pathname)
    const handler = handlers.find(([path]) => path === url.pathname)?.[1]
    if (!handler) return new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })
    return world.call(handler, { path: `${url.pathname.slice('/api/expenses'.length)}${url.search}` })
  }
}

async function serve(name: string, source: ExpenseDataset): Promise<Served> {
  const sqlite = migratedDatabase()
  sqlite.exec('PRAGMA foreign_keys = OFF')
  seedDataset(sqlite, OWNER, source)
  const world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  const dataset = (await (await world.call(getDataset)).json()) as ExpenseDataset
  return { name, sqlite, world, dataset }
}

const cases: Served[] = []

beforeAll(async () => {
  // Before any plan falls due, so that reading never inserts an instalment and the ledgers stay what
  // their generators made.
  pinClock('2020-01-15')
  const sources: Array<[string, ExpenseDataset]> = [
    ['synthetic', syntheticLedger({ months: 36, perMonth: 40, seed: 3 })],
    ['adversarial', adversarialLedger()],
    ...Array.from({ length: 8 }, (_, seed): [string, ExpenseDataset] => [`random ${seed}`, randomLedger(seed)]),
  ]
  for (const [name, source] of sources) cases.push(await serve(name, source))
}, SLOW)

afterAll(() => {
  vi.useRealTimers()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function listsOf(ledger: Ledger) {
  const { real, linear } = assembleRows(ledger)
  return { real: comparable(real), linear: comparable(linear) }
}

describe('a ledger read from the routes', () => {
  it('holds what the whole dataset makes of every viewed month, windowed or not', async () => {
    for (const c of cases) {
      vi.stubGlobal('fetch', routeFetch(c.world))
      const months = sortedMonths(c.dataset.transactions.map((t) => t.budgetMonth))
      const viewed = [months[0], months[Math.floor(months.length / 2)], months.at(-1), '2031-01'].filter(
        (m): m is string => m !== undefined,
      )
      for (const month of viewed) {
        for (const policy of [undefined, WINDOWED]) {
          const loaded = await loadLedger(apiDataSource as Required<typeof apiDataSource>, {
            viewed: month,
            ...(policy ? { policy } : {}),
          })
          const whole = ledgerFor(c.dataset, month, policy)
          const label = `${c.name} ${month} ${policy ? 'windowed' : 'default'}`
          expect(listsOf(loaded.ledger), label).toEqual(listsOf(whole))
          expect(ledgerMonths(loaded.ledger), label).toEqual(ledgerMonths(whole))
          expect(ledgerRowCount(loaded.ledger), label).toBe(ledgerRowCount(whole))
          expect(loaded.ledger.cells, label).toEqual(whole.cells)
          expect(loaded.ledger.reference, label).toEqual({ ...whole.reference, attachments: [] })
        }
      }
    }
  }, SLOW)

  it('carries the label ids in the order the dataset does', async () => {
    for (const c of cases) {
      vi.stubGlobal('fetch', routeFetch(c.world))
      const loaded = await loadLedger(apiDataSource as Required<typeof apiDataSource>)
      const served = new Map(loaded.ledger.hydrated.map((row) => [row.id, row.labelIds]))
      for (const row of c.dataset.transactions) expect(served.get(row.id), `${c.name} ${row.id}`).toEqual(row.labelIds ?? [])
    }
  }, SLOW)

  it('reads the revision the dataset route is tagged with', async () => {
    const c = cases[0]!
    vi.stubGlobal('fetch', routeFetch(c.world))
    const loaded = await loadLedger(apiDataSource as Required<typeof apiDataSource>)
    expect(loaded.revision).toBe(c.world.token())
  })

  it('reports a server without the routes as unavailable, so a caller can load the whole dataset', async () => {
    const seen: string[] = []
    vi.stubGlobal('fetch', async (input: string) => {
      seen.push(String(input))
      return new Response('<!doctype html><title>app</title>', { status: 200, headers: { 'content-type': 'text/html' } })
    })
    await expect(loadLedger(apiDataSource as Required<typeof apiDataSource>)).rejects.toBeInstanceOf(PartsUnavailableError)
    expect(seen).toEqual(['/api/expenses/reference'])
  })
})
