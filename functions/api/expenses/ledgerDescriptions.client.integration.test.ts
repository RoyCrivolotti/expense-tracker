// @vitest-environment jsdom
/**
 * The autocomplete of a window, end to end: the hook that merges the browser's own matches with the server's, reading
 * through `apiLedgerParts`, the real auth middleware, the route and the D1 adapter's SQL on SQLite with the real
 * migrations. What it shows once the typing settles is held to what the index gives over every row of the database.
 */
import { act, renderHook } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiLedgerParts } from '../../../src/data/apiLedgerParts'
import { mulberry32 } from '../../../src/domain/engine/rng'
import type { ExpenseDataset } from '../../../src/domain/types'
import { descriptionDataset, keyed, prefixesFor } from '../../../src/testing/descriptionLedger'
import { seedDataset } from '../../../src/testing/seedSqlite'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { BROWSER_LOCALE, withOlderDescriptions } from '../../../src/ui/ledgerDescriptions'
import { OWNER, createExpenseWorld, pinClock, type Handler, type World } from '../../_shared/testing/expenseWorld'
import { onRequestGet as getDescriptions } from './descriptions/suggest'
import { onRequestGet as getDataset } from './index'

let world: World
let dataset: ExpenseDataset

function routeFetch(w: World) {
  const handlers: Array<[string, Handler]> = [['/api/expenses/descriptions/suggest', getDescriptions]]
  return async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input), 'https://expenses.test')
    const handler = handlers.find(([path]) => path === url.pathname)?.[1]
    if (!handler) return new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })
    return w.call(handler, { path: `${url.pathname.slice('/api/expenses'.length)}${url.search}` })
  }
}

beforeAll(async () => {
  pinClock('2020-01-15')
  const sqlite = migratedDatabase()
  sqlite.exec('PRAGMA foreign_keys = OFF')
  seedDataset(sqlite, OWNER, descriptionDataset(11))
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  dataset = (await (await world.call(getDataset)).json()) as ExpenseDataset
})

afterAll(() => {
  vi.useRealTimers()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('what a window suggests once the typing settles', () => {
  it('is what the index gives over every row, for random prefixes and for windows that start at different months', async () => {
    vi.stubGlobal('fetch', routeFetch(world))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const rnd = mulberry32(11)
    const prefixes = prefixesFor(dataset.transactions, rnd).filter(() => rnd() < 0.4)
    const whole = keyed(dataset.transactions, { locale: BROWSER_LOCALE })
    let compared = 0
    for (const before of ['2025-04', '2026-01']) {
      const held = dataset.transactions.filter((t) => t.budgetMonth >= before)
      const index = withOlderDescriptions(keyed(held, { locale: BROWSER_LOCALE }), apiLedgerParts, { before, locale: BROWSER_LOCALE })
      const view = renderHook(({ value }) => index.useSuggestions!(index, value), { initialProps: { value: '' } })
      for (const prefix of prefixes) {
        view.rerender({ value: prefix })
        await act(async () => {
          await vi.advanceTimersByTimeAsync(300)
        })
        await vi.waitFor(() =>
          expect(view.result.current.map((s) => s.label), JSON.stringify({ before, prefix })).toEqual(whole.search(prefix).map((s) => s.label)),
        )
        compared += 1
      }
    }
    expect(compared).toBeGreaterThan(60)
  }, 120_000)
})
