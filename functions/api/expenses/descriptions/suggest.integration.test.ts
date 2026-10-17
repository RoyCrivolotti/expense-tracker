// @vitest-environment node
/**
 * GET /api/expenses/descriptions/suggest through the real auth middleware, the D1 adapter's SQL on
 * SQLite with the real migrations, and a database holding two owners.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_SUGGEST_KEYS, MAX_SUGGEST_LIMIT, MAX_SUGGEST_PREFIX, type DescriptionMatch } from '../../../../src/domain/data/descriptionSuggest'
import type { ExpenseDataset } from '../../../../src/domain/types'
import { descriptionDataset, keyed } from '../../../../src/testing/descriptionLedger'
import { makeDataset, makeTransaction } from '../../../../src/testing/factories'
import { seedDataset } from '../../../../src/testing/seedSqlite'
import { migratedDatabase, sqliteD1 } from '../../../../src/testing/sqliteD1'
import { syntheticAccounts, syntheticCategories } from '../../../../src/testing/syntheticReference'
import { shifted } from '../../../../src/testing/transactionQueryKit'
import { OTHER, OWNER, createExpenseWorld, pinClock, type World } from '../../../_shared/testing/expenseWorld'
import { onRequestPost as postTransaction } from '../transactions/index'
import { onRequestGet } from './suggest'

type Sqlite = ReturnType<typeof migratedDatabase>

let sqlite: Sqlite
let world: World
let mine: ExpenseDataset

const withReference = (ds: ExpenseDataset): ExpenseDataset => ({ ...ds, accounts: syntheticAccounts(), categories: syntheticCategories() })

function build(ds: ExpenseDataset, seed?: { descriptionNorm: boolean }) {
  sqlite = migratedDatabase()
  sqlite.exec('PRAGMA foreign_keys = OFF')
  world = createExpenseWorld(sqlite, sqliteD1(sqlite))
  mine = withReference(ds)
  seedDataset(sqlite, OWNER, mine, seed)
  const theirs = makeDataset({
    transactions: [
      makeTransaction({ id: 1, description: 'Market on the moon', date: '2024-01-01', createdAt: '2024-01-01T00:00:00Z' }),
      makeTransaction({ id: 2, description: 'Moonshine', date: '2024-01-02', createdAt: '2024-01-01T00:00:00Z' }),
    ],
  })
  seedDataset(sqlite, OTHER, shifted(withReference(theirs), 1_000_000), seed)
}

beforeEach(() => {
  pinClock('2026-10-17')
  build(descriptionDataset(2))
})

afterEach(() => {
  vi.useRealTimers()
})

const get = (query: string, email = OWNER) => world.call(onRequestGet, { path: `/descriptions/suggest?${query}`, email })

async function items(query: string): Promise<DescriptionMatch[]> {
  const response = await get(query)
  expect(response.status, query).toBe(200)
  const body = (await response.json()) as { items: DescriptionMatch[]; tooBroad: boolean }
  expect(Object.keys(body).sort(), query).toEqual(['items', 'tooBroad'])
  expect(body.tooBroad, query).toBe(false)
  return body.items
}

describe('GET /descriptions/suggest', () => {
  it('serves the browser’s own order over the rows booked before the month, with the row each match comes from', async () => {
    const want = keyed(mine.transactions.filter((t) => t.budgetMonth < '2025-09')).searchEntries('ca', 5)
    expect(want.length).toBeGreaterThan(2)
    expect(await items('q=ca&before=2025-09&limit=5')).toEqual(want)
    const first = (await items('q=ca&before=2025-09&limit=5'))[0]!
    expect(Object.keys(first).sort()).toEqual(['date', 'id', 'label', 'template'])
  })

  it('reads the typed text as the browser’s index does: case, accents and padding', async () => {
    expect(await items('q=%20CAF%C3%89%20')).toEqual(keyed(mine.transactions).searchEntries('café', 8))
    expect(await items('q=CAFÉ')).toEqual(await items('q=caf%C3%A9'))
  })

  it('answers for a single letter as well, since the read costs a few rows a description however short the prefix', async () => {
    expect(await items('q=c')).toEqual(keyed(mine.transactions).searchEntries('c', 8))
    expect((await items('q=c')).length).toBeGreaterThan(0)
  })

  it('answers eight matches when it is not asked for another number, and at most the maximum when it is', async () => {
    expect((await items('q=ca')).length).toBeLessThanOrEqual(8)
    expect((await items(`q=sh&limit=${MAX_SUGGEST_LIMIT}`)).length).toBeLessThanOrEqual(MAX_SUGGEST_LIMIT)
  })

  it('sorts by the locale it is given', async () => {
    const swedish = await items('q=%C3%A4r&locale=sv')
    expect(swedish).toEqual(keyed(mine.transactions, { locale: 'sv' }).searchEntries('är', 8))
  })

  it('answers nothing, with a 200, for a prefix nothing starts with', async () => {
    expect(await items('q=qqqq')).toEqual([])
  })

  // The answer follows every write, so a cache that kept it (a shared one included) would serve a stale one.
  it('forbids any cache to keep it, the broad answer included', async () => {
    expect((await get('q=ca')).headers.get('cache-control')).toBe('private, no-store')
    expect((await get('q=qqqq')).headers.get('cache-control')).toBe('private, no-store')
  })

  it('answers 401 with no signed-in user', async () => {
    expect((await world.call(onRequestGet, { path: '/descriptions/suggest?q=ca', email: '' })).status).toBe(401)
  })

  it('serves the owner’s own rows only', async () => {
    expect((await items('q=mar')).map((m) => m.label)).toEqual([])
    const theirs = await get('q=mar', OTHER)
    expect(((await theirs.json()) as { items: DescriptionMatch[] }).items.map((m) => m.label)).toEqual(['Market on the moon'])
  })

  it('reads a row written a moment ago, with its normalized description set by the write', async () => {
    const created = await world.call(postTransaction, {
      method: 'POST',
      path: '/transactions',
      body: { date: '2026-10-10', budgetMonth: '2026-10', description: 'Éclair du jour', accountId: 1, categoryId: 1, type: 'expense', amountCents: 5, cancelled: false },
    })
    expect(created.status).toBe(201)
    expect((await items('q=%C3%89clair')).map((m) => m.label)).toEqual(['Éclair du jour'])
    expect((await items('q=%C3%A9clair&before=2026-10')).map((m) => m.label)).toEqual([])
  })
})

describe('what it refuses', () => {
  const huge = 'x'.repeat(MAX_SUGGEST_PREFIX + 1)
  const cases: Array<[string, string, number, string]> = [
    ['no prefix', '', 400, 'q must be text'],
    ['a blank prefix', 'q=%20%20', 400, 'must not be blank'],
    ['a prefix that is too long', `q=${huge}`, 400, 'characters or fewer'],
    ['a date where a month is wanted', 'q=ca&before=2026-02-28', 400, 'budget month'],
    ['a month that is not a month', 'q=ca&before=2026-13', 400, 'budget month'],
    ['a limit of zero', 'q=ca&limit=0', 400, 'limit must be'],
    ['a limit above the maximum', `q=ca&limit=${MAX_SUGGEST_LIMIT + 1}`, 400, 'limit must be'],
    ['a limit that is not a number', 'q=ca&limit=lots', 400, 'limit must be'],
    ['a limit in hexadecimal', 'q=ca&limit=0x10', 400, 'limit must be'],
    ['a limit in exponent form', 'q=ca&limit=1e1', 400, 'limit must be'],
    ['a limit with a sign', 'q=ca&limit=%2B5', 400, 'limit must be'],
    ['a limit with spaces', 'q=ca&limit=%205%20', 400, 'limit must be'],
    ['a fractional limit', 'q=ca&limit=2.0', 400, 'limit must be'],
    ['a locale that is not one', 'q=ca&locale=not%20a%20locale', 400, 'locale must be'],
    ['a parameter given twice', 'q=ca&q=ma', 400, 'more than once'],
    ['an owner', `q=ca&owner=${OTHER}`, 400, 'Unknown parameter: owner'],
    ['a parameter it does not know', 'q=ca&sort=asc', 400, 'Unknown parameter: sort'],
  ]
  it.each(cases)('answers %s with 400', async (_name, query, status, message) => {
    const response = await get(query)
    expect(response.status).toBe(status)
    expect(((await response.json()) as { error: string }).error).toContain(message)
  })

  it('answers a prefix that matches too many descriptions with 200 and tooBroad, and a list once it is longer', async () => {
    const rows = Array.from({ length: MAX_SUGGEST_KEYS + 1 }, (_, i) =>
      makeTransaction({ id: i + 1, description: `Shop ${String(i).padStart(4, '0')}`, date: '2025-03-01', createdAt: '2025-03-01T00:00:00Z' }),
    )
    build(makeDataset({ transactions: rows }))
    const broad = await get('q=shop')
    expect(broad.status).toBe(200)
    expect(await broad.json()).toEqual({ items: [], tooBroad: true })
    expect((await items('q=shop%2000')).length).toBe(8)
  })
})

describe('while descriptions are still waiting for their normalized form', () => {
  it('answers 503 and then answers, because each request makes progress', async () => {
    const rows = Array.from({ length: 2_200 }, (_, i) =>
      makeTransaction({ id: i + 1, description: `Shop ${i}`, date: '2025-03-01', createdAt: '2025-03-01T00:00:00Z' }),
    )
    build(makeDataset({ transactions: rows }), { descriptionNorm: false })
    const first = await get('q=shop%2010')
    expect(first.status).toBe(503)
    expect(first.headers.get('retry-after')).toBe('1')
    const second = await get('q=shop%2010')
    expect(second.status).toBe(200)
    expect(((await second.json()) as { items: DescriptionMatch[] }).items.length).toBeGreaterThan(0)
  })

  it('does not move the revision', async () => {
    build(descriptionDataset(3), { descriptionNorm: false })
    // A token that exists before the first request, which is the one that fills.
    sqlite.prepare('INSERT INTO owner_revision (owner, token) VALUES (?, ?)').run(OWNER, 'before-the-fill')
    const waiting = (): number =>
      (sqlite.prepare('SELECT count(*) AS n FROM transactions WHERE owner = ? AND description_norm IS NULL').get(OWNER) as { n: number }).n
    expect(waiting()).toBeGreaterThan(0)
    expect((await get('q=ca')).status).toBe(200)
    expect(waiting()).toBe(0)
    expect(world.token()).toBe('before-the-fill')
  })
})
