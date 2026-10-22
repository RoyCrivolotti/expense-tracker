// @vitest-environment node
/**
 * The browser's two reads that a client holding only some of the rows cannot answer itself, end to end:
 * `apiLedgerParts` fetching `GET /usage` and `GET /descriptions/suggest` through the real auth middleware, the
 * routes and the D1 adapter's SQL on SQLite with the real migrations. Each answer is held to the one the engine
 * gives over every row of the same database.
 */
import type { DatabaseSync } from 'node:sqlite'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiLedgerParts } from '../../../src/data/apiLedgerParts'
import { LedgerUsage } from '../../../src/data/ledgerUsage'
import { mergeDescriptionMatches, normalizeDescriptionKey, suggestDescriptionsOf } from '../../../src/data/descriptionIndex'
import { MAX_SUGGEST_KEYS } from '../../../src/domain/data/descriptionSuggest'
import { usageFromDataset } from '../../../src/domain/engine/recordUsage'
import type { ExpenseDataset } from '../../../src/domain/types'
import { descriptionDataset, keyed } from '../../../src/testing/descriptionLedger'
import { makeTransaction } from '../../../src/testing/factories'
import { randomLedger } from '../../../src/testing/randomLedger'
import { seedDataset } from '../../../src/testing/seedSqlite'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { OWNER, createExpenseWorld, pinClock, type Handler, type World } from '../../_shared/testing/expenseWorld'
import { onRequestGet as getDescriptions } from './descriptions/suggest'
import { onRequestGet as getDataset } from './index'
import { onRequestPatch as patchBulk } from './transactions/bulk'
import { onRequestGet as getUsage } from './usage'

interface Served {
  sqlite: DatabaseSync
  world: World
  /** What GET /api/expenses serves. */
  dataset: ExpenseDataset
}

async function serve(source: ExpenseDataset): Promise<Served> {
  const sqlite = migratedDatabase()
  sqlite.exec('PRAGMA foreign_keys = OFF')
  seedDataset(sqlite, OWNER, source)
  const world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  return { sqlite, world, dataset: (await (await world.call(getDataset)).json()) as ExpenseDataset }
}

function routeFetch(world: World, seen: string[] = []) {
  const handlers: Array<[string, Handler]> = [
    ['/api/expenses/usage', getUsage],
    ['/api/expenses/descriptions/suggest', getDescriptions],
  ]
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), 'https://expenses.test')
    init?.signal?.throwIfAborted()
    seen.push(`${url.pathname}${url.search}`)
    const handler = handlers.find(([path]) => path === url.pathname)?.[1]
    if (!handler) return new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })
    return world.call(handler, { path: `${url.pathname.slice('/api/expenses'.length)}${url.search}` })
  }
}

let ledger: Served
let words: Served

beforeAll(async () => {
  pinClock('2020-01-15')
  ledger = await serve(randomLedger(5))
  words = await serve(descriptionDataset(3))
}, 60_000)

afterAll(() => {
  vi.useRealTimers()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the usage counts a client reads', () => {
  it('are the counts the engine gives over every row, with the revision they were read under', async () => {
    vi.stubGlobal('fetch', routeFetch(ledger.world))

    const { revision, ...counts } = await apiLedgerParts.readUsagePart()

    expect(counts).toEqual(usageFromDataset(ledger.dataset))
    expect(typeof revision).toBe('string')
    const some = counts.categories.some((c) => c.transactions > 0) && counts.labels.some((l) => l.transactions > 0)
    expect(some).toBe(true)
  })
})

describe('the usage counts a client keeps', () => {
  it('follow a write the server made: read again after it, they are the counts over the rows as they are now', async () => {
    const served = await serve(randomLedger(5))
    vi.stubGlobal('fetch', routeFetch(served.world))
    const store = new LedgerUsage(apiLedgerParts)
    store.watch()
    await vi.waitFor(() => expect(store.getState().usage).not.toBeNull())
    const first = store.getState().usage!
    const free = served.dataset.transactions.filter((t) => !t.planId && !t.settledBy && !t.flagId)
    const from = free[0]!.categoryId
    const other = first.categories.find((c) => c.id !== from)!
    const ids = free.filter((t) => t.categoryId === from).map((t) => t.id)

    await served.world.call(patchBulk, { method: 'PATCH', path: '/transactions/bulk', body: { ids: ids.slice(0, 100), patch: { categoryId: other.id } } })
    store.noteWrite(true)

    const now = (await (await served.world.call(getDataset)).json()) as ExpenseDataset
    await vi.waitFor(() => {
      const { categories, accounts, flags, labels } = store.getState().usage!
      expect({ categories, accounts, flags, labels }).toEqual(usageFromDataset(now))
    })
    expect(store.getState()).toMatchObject({ stale: false, error: null })
    expect(store.getState().usage!.revision).not.toBe(first.revision)
  })
})

describe('the older descriptions a client reads', () => {
  const rows = () => words.dataset.transactions

  it.each([
    ['c', undefined],
    ['ca', '2025-09'],
    ['re', '2026-01'],
    ['zzz', '2025-09'],
    ['🍕', '2025-06'],
  ])('for "%s" before %s are what the index gives over the rows booked before that month', async (typed, before) => {
    vi.stubGlobal('fetch', routeFetch(words.world))
    const request = { prefix: normalizeDescriptionKey(typed), limit: 8, ...(before ? { before } : {}) }

    const answer = await apiLedgerParts.readDescriptionSuggest(request)

    expect(answer).toEqual(suggestDescriptionsOf(rows(), request))
  })

  it('join the rows a client holds into the answer the index gives over every row', async () => {
    vi.stubGlobal('fetch', routeFetch(words.world))
    const before = '2025-10'
    const held = rows().filter((row) => row.budgetMonth >= before)
    const locale = new Intl.Collator().resolvedOptions().locale
    for (const typed of ['c', 'ca', 'r', 'ren', 'p', 'st', 'u', 'z']) {
      const { items } = await apiLedgerParts.readDescriptionSuggest({ prefix: typed, limit: 8, before, locale })

      const merged = mergeDescriptionMatches(keyed(held, { locale }).searchEntries(typed, 8), items, 8, locale)

      expect(merged.map((m) => m.label), typed).toEqual(keyed(rows(), { locale }).searchEntries(typed, 8).map((m) => m.label))
    }
  })

  it('say a prefix is too broad, with no matches, once more than the cap of descriptions start with it', async () => {
    const wide = await serve({
      ...words.dataset,
      transactions: Array.from({ length: MAX_SUGGEST_KEYS + 20 }, (_, i) =>
        makeTransaction({ id: 9_000 + i, description: `Wide ${i}`, budgetMonth: '2025-01', date: '2025-01-05' }),
      ),
    })
    vi.stubGlobal('fetch', routeFetch(wide.world))

    const answer = await apiLedgerParts.readDescriptionSuggest({ prefix: 'wide', limit: 8 })

    expect(answer).toEqual({ items: [], tooBroad: true })
  })

  it('send the browser’s own locale and budget month, and stop when asked to', async () => {
    const seen: string[] = []
    vi.stubGlobal('fetch', routeFetch(words.world, seen))
    await apiLedgerParts.readDescriptionSuggest({ prefix: 'caf', limit: 5, before: '2025-10', locale: 'sv-SE' })
    expect(seen).toEqual(['/api/expenses/descriptions/suggest?q=caf&limit=5&before=2025-10&locale=sv-SE'])

    const stop = new AbortController()
    stop.abort()
    await expect(apiLedgerParts.readDescriptionSuggest({ prefix: 'caf', limit: 5 }, { signal: stop.signal })).rejects.toThrow()
  })
})
