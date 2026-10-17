/**
 * The cost of a page is the rows SQLite visits, and D1 bills those as rows read whether or not they
 * are returned. These tests run every query shape the paged reads produce through
 * `EXPLAIN QUERY PLAN` (the statements are the ones the repository actually ran, not copies) and fail
 * on a full scan of `transactions`, on a walk that does not use the new indexes, and, for the shapes meant to
 * be read straight off an index in order, on a sort. They run with and without table statistics,
 * because the planner chooses differently once it has them.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { TransactionKey } from '../../src/domain/data/transactionQuery'
import type { TxnFilter } from '../../src/domain/engine/transactions'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { OWNER, planOf, queryDb, type QueryDb } from '../../src/testing/transactionQueryKit'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'
import type { ExpenseRepository } from '../../src/domain/ports/expenseRepository'

const AFTER: TransactionKey = { date: '2026-06-15', id: 1_500 }

interface Shape {
  name: string
  filter: TxnFilter
  after?: TransactionKey
  /**
   * Nothing but the owner's own date order can serve this filter well, so the rows must come straight
   * off one of the two new indexes in the order asked for, with no sort: `date` for (owner, date) and
   * `month` for (owner, budget_month, date). Filters on category, account, flag
   * and label may instead use the index that names them, which is the planner's call.
   */
  walk?: 'date' | 'month'
}

const SHAPES: Shape[] = [
  { name: 'newest first', filter: {}, walk: 'date' },
  { name: 'next page', filter: {}, after: AFTER, walk: 'date' },
  { name: 'month', filter: { month: '2026-03' }, walk: 'month' },
  { name: 'month, next page', filter: { month: '2026-03' }, after: { date: '2026-03-15', id: 900 }, walk: 'month' },
  { name: 'from a date', filter: { dateFrom: '2026-01-01' }, walk: 'date' },
  { name: 'up to a date', filter: { dateTo: '2026-01-31' }, walk: 'date' },
  { name: 'date range, next page', filter: { dateFrom: '2026-01-01', dateTo: '2026-03-31' }, after: AFTER, walk: 'date' },
  { name: 'category', filter: { categoryId: 3 } },
  { name: 'account', filter: { accountId: 3 } },
  { name: 'type', filter: { type: 'income' }, walk: 'date' },
  { name: 'status posted', filter: { status: 'posted' }, walk: 'date' },
  { name: 'status forecast', filter: { status: 'forecast' }, walk: 'date' },
  { name: 'status cancelled, month', filter: { status: 'cancelled', month: '2026-03' }, walk: 'month' },
  { name: 'flag', filter: { flagId: 1 } },
  { name: 'no flag', filter: { flagId: 'none' }, walk: 'date' },
  { name: 'amount bounds', filter: { amountMinCents: 1_000, amountMaxCents: 5_000 }, walk: 'date' },
  { name: 'text', filter: { query: 'market' }, walk: 'date' },
  { name: 'text with accents', filter: { query: 'café ñandú' }, walk: 'date' },
  { name: 'text or amount', filter: { query: '64', queryAmount: { fromCents: 6_400, toCents: 6_499 } }, walk: 'date' },
  { name: 'labels', filter: { labelIds: [1, 3] } },
  {
    name: 'everything at once',
    filter: {
      month: '2026-03',
      categoryId: 3,
      accountId: 3,
      type: 'expense',
      status: 'forecast',
      flagId: 'none',
      labelIds: [1, 2],
      amountMinCents: 100,
      amountMaxCents: 90_000,
      query: 'éé',
      queryAmount: { fromCents: 1, toCents: 99 },
    },
    after: AFTER,
  },
]

const FULL_SCAN = /^SCAN (t|transactions)\b/
const WALKS = {
  date: /SEARCH t USING INDEX idx_txn_owner_date \(owner=\?/,
  month: /SEARCH t USING INDEX idx_txn_owner_month_date \(owner=\? AND budget_month=\?/,
}
const SORT = /USE TEMP B-TREE FOR ORDER BY/

function expectNoFullScan(plan: string[]): void {
  expect(plan.filter((line) => FULL_SCAN.test(line)), `full scan of transactions:\n${plan.join('\n')}`).toEqual([])
}

describe.each([{ stats: false }, { stats: true }])('query plans (table statistics: $stats)', ({ stats }) => {
  let kit: QueryDb
  let repo: ExpenseRepository

  beforeAll(() => {
    // Several owners, so that "this owner's rows" is a small part of the table, as it is in production.
    const others = Array.from({ length: 8 }, (_, i) => ({
      owner: `other${i}@example.com`,
      dataset: syntheticLedger({ months: 24, perMonth: 30, seed: 50 + i }),
    }))
    kit = queryDb(syntheticLedger({ months: 24, perMonth: 30, seed: 7 }), others)
    if (stats) kit.sqlite.exec('ANALYZE')
    repo = createD1ExpenseRepository({ DB: kit.d1 })
  })

  async function ran(run: () => Promise<unknown>) {
    kit.statements.length = 0
    await run()
    return [...kit.statements]
  }

  it.each(SHAPES)('list: $name', async ({ filter, after, walk }) => {
    const [statement] = await ran(() =>
      repo.queryTransactions(OWNER, filter, after ? { limit: 50, after } : { limit: 50 }),
    )
    const plan = planOf(kit.sqlite, statement as never)
    const text = plan.join('\n')
    expectNoFullScan(plan)
    if (walk) {
      expect(text, `not read through the ${walk} index:\n${text}`).toMatch(WALKS[walk])
      expect(text, `sorts:\n${text}`).not.toMatch(SORT)
    }
    // Looking up a row's account, statement and labels is by key as well.
    expect(plan.filter((line) => /^SCAN (a|s|tl|l)\b/.test(line)), text).toEqual([])
  })

  it.each(SHAPES)('summary: $name', async ({ filter }) => {
    const statements = await ran(() => repo.summarizeTransactions(OWNER, filter))
    expect(statements).toHaveLength(2)
    for (const statement of statements) {
      expectNoFullScan(planOf(kit.sqlite, statement))
    }
  })

  it('one row by id is a lookup by primary key', async () => {
    const [statement] = await ran(() => repo.getTransaction(OWNER, 1_234))
    const plan = planOf(kit.sqlite, statement as never)
    expect(plan.join('\n')).toMatch(/SEARCH t USING INTEGER PRIMARY KEY \(rowid=\?\)/)
    expectNoFullScan(plan)
  })

  it('binds a bounded number of values, whatever the filter holds', async () => {
    const longest = SHAPES[SHAPES.length - 1] as Shape
    const widest: TxnFilter = {
      ...longest.filter,
      query: 'éèêëàâäôöûüçñáíóúßαβγδ'.slice(0, 8),
      labelIds: Array.from({ length: 100 }, (_, i) => i + 1),
    }
    const used = await ran(() =>
      repo.queryTransactions(OWNER, widest, { limit: 200, after: AFTER }),
    )
    const most = Math.max(...used.map((s) => s.params.length))
    expect(most).toBeLessThanOrEqual(40)
  })
})
