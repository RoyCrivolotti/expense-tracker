/**
 * The three read routes through the real auth middleware, the real application layer and the D1
 * adapter's SQL on SQLite with the real migrations, over a database that holds two owners.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { filterTransactions, netSpendCents } from '../../../../src/domain/engine/transactions'
import type { Transaction } from '../../../../src/domain/types'
import { MAX_PAGE_LIMIT, MAX_QUERY_LENGTH } from '../../../../src/domain/data/transactionQuery'
import { syntheticLedger } from '../../../../src/testing/syntheticLedger'
import { OTHER_OWNER, OWNER, queryDb } from '../../../../src/testing/transactionQueryKit'
import { loadDataset } from '../../../_shared/db'
import type { Env } from '../../../_shared/env'
import { invokePagesRoute } from '../../../_shared/invokePagesRoute'
import { onRequestGet as getOne } from './[id]'
import { onRequestGet as getList } from './list'
import { onRequestGet as getSummary } from './summary'

const BASE = 'https://expenses.test/api/expenses/transactions'

let env: Env
let sqlite: DatabaseSync
let mine: Transaction[]
let theirs: Transaction[]
let theirIds: Set<number>
let mineIds: Set<number>

interface ListBody {
  items: Transaction[]
  nextCursor: string | null
}

beforeAll(async () => {
  const kit = queryDb(syntheticLedger({ months: 4, perMonth: 15, seed: 1 }), [
    { owner: OTHER_OWNER, dataset: syntheticLedger({ months: 4, perMonth: 15, seed: 2 }) },
  ])
  sqlite = kit.sqlite
  env = { DB: kit.d1, ALLOWED_EMAILS: `${OWNER},${OTHER_OWNER}` }
  mine = (await loadDataset(env, OWNER)).transactions
  theirs = (await loadDataset(env, OTHER_OWNER)).transactions
  mineIds = new Set(mine.map((t) => t.id))
  theirIds = new Set(theirs.map((t) => t.id))
})

const list = (query: string, email: string | false = OWNER) =>
  invokePagesRoute(getList, { env, method: 'GET', url: `${BASE}/list?${query}`, email })
const summary = (query: string, email: string | false = OWNER) =>
  invokePagesRoute(getSummary, { env, method: 'GET', url: `${BASE}/summary?${query}`, email })
const one = (id: string, email: string | false = OWNER) =>
  invokePagesRoute(getOne, { env, method: 'GET', url: `${BASE}/${id}`, params: { id }, email })

async function pagesOf(query: string, email = OWNER): Promise<Transaction[]> {
  const out: Transaction[] = []
  let cursor: string | null = null
  for (let i = 0; i < 100; i += 1) {
    const response = await list(`${query}&limit=25${cursor ? `&cursor=${cursor}` : ''}`, email)
    expect(response.status).toBe(200)
    const body = (await response.json()) as ListBody
    out.push(...body.items)
    cursor = body.nextCursor
    if (cursor === null) return out
  }
  throw new Error('paging did not end')
}

describe('GET /transactions/list', () => {
  it('serves the owner’s rows in pages that put end to end are the dataset’s order', async () => {
    const rows = await pagesOf('')
    expect(rows.map((t) => t.id)).toEqual(filterTransactions(mine, {}).map((t) => t.id))
    expect(rows.length).toBeGreaterThan(50)
  })

  it('answers with items and a cursor, and a null cursor on the last page', async () => {
    const first = (await (await list('limit=10')).json()) as ListBody
    expect(first.items).toHaveLength(10)
    expect(typeof first.nextCursor).toBe('string')
    const all = (await (await list(`limit=${MAX_PAGE_LIMIT}`)).json()) as ListBody
    expect(all.items.length).toBe(mine.length)
    expect(all.nextCursor).toBeNull()
    expect(first.items[0]).toEqual(all.items[0])
  })

  it('applies the filter fields, as the engine reads them', async () => {
    const query = 'month=2026-08&type=expense&status=posted&query=market'
    const want = filterTransactions(mine, { month: '2026-08', type: 'expense', status: 'posted', query: 'market' })
    expect((await pagesOf(query)).map((t) => t.id)).toEqual(want.map((t) => t.id))
    const text = await pagesOf('query=CORNER&queryAmountFromCents=0&queryAmountToCents=0')
    expect(text.map((t) => t.id)).toEqual(
      filterTransactions(mine, { query: 'CORNER', queryAmount: { fromCents: 0, toCents: 0 } }).map((t) => t.id),
    )
    const labelled = await pagesOf('labelIds=1,3')
    expect(labelled.map((t) => t.id)).toEqual(filterTransactions(mine, { labelIds: [1, 3] }).map((t) => t.id))
  })

  const refused: Array<[string, string, string]> = [
    ['a cursor that is not one', 'cursor=hello', 'Invalid cursor'],
    ['a month that does not exist', 'month=2026-13', 'month must be YYYY-MM'],
    ['a date that does not exist', 'dateFrom=2026-02-30', 'calendar date'],
    ['an id that is not a number', 'categoryId=abc', 'categoryId must be'],
    ['labels that are not numbers', 'labelIds=1,x', 'labelIds must be'],
    ['a type that does not exist', 'type=gift', 'type must be one of'],
    ['a negative amount bound', 'amountMinCents=-5', 'amountMinCents must be'],
    ['search text that is too long', `query=${'a'.repeat(MAX_QUERY_LENGTH + 1)}`, 'characters or fewer'],
    ['one end of an amount range', 'query=x&queryAmountFromCents=5', 'go together'],
    ['a limit above the maximum', `limit=${MAX_PAGE_LIMIT + 1}`, 'limit must be a whole number from 1 to'],
    ['a limit of zero', 'limit=0', 'limit must be'],
    ['a limit that is not a number', 'limit=lots', 'limit must be'],
    ['a field given twice', 'month=2026-08&month=2026-09', 'more than once'],
    ['a parameter it does not know', 'sort=asc', 'Unknown parameter: sort'],
    ['an owner', `owner=${OTHER_OWNER}`, 'Unknown parameter: owner'],
  ]
  it.each(refused)('answers 400 to %s', async (_label, query, message) => {
    const response = await list(query)
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toContain(message)
  })

  it('answers 400 to a cursor made for another filter, and to a cursor with its bytes changed', async () => {
    const first = (await (await list('month=2026-08&limit=3')).json()) as ListBody
    const cursor = first.nextCursor as string
    const other = await list(`month=2026-07&limit=3&cursor=${cursor}`)
    expect(other.status).toBe(400)
    expect(((await other.json()) as { error: string }).error).toContain('different filter')
    const mangled = `${cursor.slice(0, 8)}${cursor[8] === 'A' ? 'B' : 'A'}${cursor.slice(9)}`
    expect((await list(`month=2026-08&limit=3&cursor=${mangled}`)).status).toBe(400)
    expect((await list(`month=2026-08&limit=3&cursor=${cursor}`)).status).toBe(200)
  })

  it('answers 401 with no signed-in user', async () => {
    expect((await list('', false)).status).toBe(401)
  })
})

describe('GET /transactions/summary', () => {
  it('counts and sums what the pure functions do', async () => {
    for (const [query, filter] of [
      ['', {}],
      ['month=2026-08', { month: '2026-08' }],
      ['type=expense&status=cancelled', { type: 'expense' as const, status: 'cancelled' as const }],
      ['query=hotel', { query: 'hotel' }],
    ] as const) {
      const matching = filterTransactions(mine, filter)
      const response = await summary(query)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        revision: expect.any(String),
        count: matching.length,
        capped: false,
        netSpendCents: netSpendCents(matching),
      })
    }
  })

  it('starts with the owner’s revision, which only a write changes', async () => {
    const read = async () => ((await (await summary('')).json()) as { revision: string }).revision
    const first = await read()

    expect(await read()).toBe(first)
    expect(await (await invokePagesRoute(getSummary, { env, method: 'GET', url: `${BASE}/summary`, email: OTHER_OWNER })).json())
      .not.toMatchObject({ revision: first })
    sqlite.prepare("UPDATE owner_revision SET token = 'moved' WHERE owner = ?").run(OWNER)
    expect(await read()).toBe('moved')
  })

  it('refuses paging parameters and bad filters', async () => {
    for (const query of ['limit=5', 'cursor=abc', 'month=June', 'sort=asc']) {
      expect((await summary(query)).status, query).toBe(400)
    }
    expect((await summary('', false)).status).toBe(401)
  })
})

describe('GET /transactions/:id', () => {
  it('returns the row as the dataset carries it', async () => {
    for (const row of [mine[0], mine[17], mine.at(-1)] as Transaction[]) {
      const response = await one(String(row.id))
      expect(response.status).toBe(200)
      const body = (await response.json()) as Transaction
      expect(body).toEqual({ ...row, labelIds: [...(row.labelIds ?? [])].sort((a, b) => a - b) })
    }
  })

  it('answers 404 to an id that does not exist, 400 to one that is not an id', async () => {
    expect((await one('987654321')).status).toBe(404)
    expect((await one('abc')).status).toBe(400)
    expect((await one('0')).status).toBe(400)
    expect((await one('1.5')).status).toBe(400)
  })

  it('answers 401 with no signed-in user', async () => {
    expect((await one('1', false)).status).toBe(401)
  })
})

describe('one owner never sees another’s rows', () => {
  it('on the list: each owner pages through only their own', async () => {
    const seenByMe = (await pagesOf('')).map((t) => t.id)
    const seenByThem = (await pagesOf('', OTHER_OWNER)).map((t) => t.id)
    expect(new Set(seenByMe)).toEqual(mineIds)
    expect(new Set(seenByThem)).toEqual(theirIds)
    expect(seenByMe.some((id) => theirIds.has(id))).toBe(false)
    expect(seenByThem.some((id) => mineIds.has(id))).toBe(false)
  })

  it('on the list: a cursor from one owner’s session, or a filter naming their ids, reaches nothing of theirs', async () => {
    const first = (await (await list('limit=5')).json()) as ListBody
    const borrowed = await list(`limit=100&cursor=${first.nextCursor}`, OTHER_OWNER)
    expect(borrowed.status).toBe(200)
    expect(((await borrowed.json()) as ListBody).items.every((t) => theirIds.has(t.id))).toBe(true)
    const aCategory = mine[0]?.categoryId ?? 0
    for (const query of [`categoryId=${aCategory}`, `accountId=${mine[0]?.accountId ?? 0}`, 'flagId=2', 'labelIds=2']) {
      const body = (await (await list(`${query}&limit=200`, OTHER_OWNER)).json()) as ListBody
      expect(body.items.every((t) => theirIds.has(t.id)), query).toBe(true)
    }
    const nothing = (await (await list(`categoryId=${aCategory}`, OTHER_OWNER)).json()) as ListBody
    expect(nothing.items).toEqual([])
  })

  it('on the summary: each owner’s totals are their own', async () => {
    const a = (await (await summary('')).json()) as { count: number; netSpendCents: number }
    const b = (await (await summary('', OTHER_OWNER)).json()) as { count: number; netSpendCents: number }
    expect(a.count).toBe(mine.length)
    expect(b.count).toBe(theirs.length)
    expect(a.netSpendCents).toBe(netSpendCents(mine))
    expect(b.netSpendCents).toBe(netSpendCents(theirs))
    const foreignCategory = (await (await summary(`categoryId=${mine[0]?.categoryId}`, OTHER_OWNER)).json()) as {
      count: number
    }
    expect(foreignCategory.count).toBe(0)
  })

  it('by id: another owner’s row looks exactly like one that does not exist', async () => {
    const theirId = String(theirs[0]?.id)
    const mineId = String(mine[0]?.id)
    const missing = await one('987654321')
    for (const response of [await one(theirId), await one(mineId, OTHER_OWNER)]) {
      expect(response.status).toBe(404)
      expect(await response.text()).toBe(await missing.clone().text())
    }
    expect((await one(theirId, OTHER_OWNER)).status).toBe(200)
    expect((await one(mineId)).status).toBe(200)
  })
})
