import { describe, expect, it } from 'vitest'
import type { ExpenseRepository } from '../domain/ports/expenseRepository'
import { D1_MAX_BOUND_PARAMETERS } from './sqliteD1'
import { syntheticLedger } from './syntheticLedger'
import {
  OTHER_OWNER,
  OWNER,
  allPages,
  awkwardLedger,
  filterStream,
  planOf,
  queryDb,
  vocabularyOf,
} from './transactionQueryKit'

const small = () => syntheticLedger({ months: 2, perMonth: 5, seed: 4 })

describe('queryDb', () => {
  it('is the D1 stand-in, which refuses more than 100 bound values, and records the statements it is given', async () => {
    const kit = queryDb(small())
    const tooMany = Array.from({ length: D1_MAX_BOUND_PARAMETERS + 1 }, () => 1)
    await expect(kit.d1.prepare('SELECT 1').bind(...tooMany).first()).rejects.toThrow('too many SQL variables')
    await kit.d1.prepare('SELECT ? AS n').bind(7).first()
    expect(kit.statements.at(-1)).toEqual({ sql: 'SELECT ? AS n', params: [7] })
  })

  it('keeps each owner’s rows apart, with ids that do not collide', () => {
    const kit = queryDb(small(), [
      { owner: OTHER_OWNER, dataset: small() },
      { owner: 'third@example.com', dataset: small() },
    ])
    const counts = kit.sqlite
      .prepare('SELECT owner, COUNT(*) AS n, COUNT(DISTINCT id) AS ids FROM transactions GROUP BY owner')
      .all()
    expect(counts).toHaveLength(3)
    for (const row of counts) expect(row.n).toBe(row.ids)
    const total = kit.sqlite.prepare('SELECT COUNT(*) AS n, COUNT(DISTINCT id) AS ids FROM transactions').get()
    expect(total?.n).toBe(total?.ids)
  })

  it('shows the plan SQLite makes for a statement', () => {
    const kit = queryDb(small())
    const plan = planOf(kit.sqlite, { sql: 'SELECT * FROM transactions WHERE owner = ?', params: [OWNER] })
    expect(plan.join('\n')).toMatch(/idx_txn_owner/)
  })
})

describe('awkwardLedger', () => {
  it('holds the rows the SQL has to get right', () => {
    const { transactions } = awkwardLedger()
    const texts = transactions.map((t) => t.description)
    for (const text of ['CAFÉ ÑANDÚ', '100% juice', 'a_b', 'Orphan account']) expect(texts).toContain(text)
    expect(transactions.filter((t) => t.date === '2026-05-15').length).toBeGreaterThan(40)
    expect(new Set(transactions.map((t) => t.id)).size).toBe(transactions.length)
  })
})

describe('filterStream', () => {
  const vocabulary = vocabularyOf(awkwardLedger())

  it('is the same for the same seed and different for another', () => {
    expect(filterStream(vocabulary, 30, 5)).toEqual(filterStream(vocabulary, 30, 5))
    expect(filterStream(vocabulary, 30, 5)).not.toEqual(filterStream(vocabulary, 30, 6))
  })

  it('uses every field of the filter, and both forms of the flag and the date range', () => {
    const filters = filterStream(vocabulary, 400, 1)
    const keys = new Set(filters.flatMap((f) => Object.keys(f)))
    expect(keys).toEqual(
      new Set([
        'month',
        'dateFrom',
        'dateTo',
        'categoryId',
        'accountId',
        'type',
        'status',
        'flagId',
        'labelIds',
        'query',
        'amountMinCents',
        'amountMaxCents',
        'queryAmount',
      ]),
    )
    expect(filters.some((f) => f.flagId === 'none')).toBe(true)
    expect(filters.some((f) => typeof f.flagId === 'number')).toBe(true)
    expect(filters.some((f) => f.dateFrom !== undefined && f.dateTo === undefined)).toBe(true)
    expect(filters.some((f) => f.dateFrom !== undefined && f.dateTo !== undefined)).toBe(true)
    expect(filters.some((f) => f.dateFrom !== undefined && f.month !== undefined)).toBe(true)
  })
})

describe('allPages', () => {
  it('follows the cursor to the end, and gives up on a repository that never ends', async () => {
    const endless = {
      queryTransactions: () =>
        Promise.resolve({ items: [{ id: 1, date: '2026-01-01' }], hasMore: true }),
    } as unknown as ExpenseRepository
    await expect(allPages(endless, OWNER, {}, 1)).rejects.toThrow('paging did not end')
    const once = {
      queryTransactions: () => Promise.resolve({ items: [], hasMore: true }),
    } as unknown as ExpenseRepository
    expect(await allPages(once, OWNER, {}, 1)).toEqual([])
  })
})
