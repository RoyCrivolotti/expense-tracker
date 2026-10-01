import { describe, expect, it } from 'vitest'
import { loadDataset } from './db'
import type { Env } from './env'

const OWNER = 'owner@example.com'

const TXN_ROW = {
  id: 1,
  date: '2026-05-01',
  budget_month: '2026-05',
  description: 'Hotel',
  account_id: 1,
  category_id: 1,
  type: 'expense',
  amount_cents: 12_000,
  cancelled: 0,
  notes: null,
  created_at: '2026-05-01T00:00:00Z',
  plan_id: null,
  installment_index: null,
  flag_id: null,
  settled_by: null,
  report_count: null,
  report_covered_cents: null,
}

const LABEL_ROW = {
  id: 2,
  name: 'Japan trip',
  color: '#10b981',
  description: null,
  sort_order: 0,
  active: 1,
}

/**
 * loadDataset fires ~13 parallel queries plus one for the installment
 * backfill it runs first; everything not explicitly named here returns an
 * empty result, which is a legitimate answer for every one of them (no
 * settings row falls back to defaultExpenseSettings, empty installment plans
 * makes the backfill a no-op, and so on).
 */
function stubEnv(): Env {
  return {
    DB: {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () => null,
          all: async () => {
            if (sql.includes('FROM transactions WHERE owner')) return { results: [TXN_ROW] }
            if (sql.includes('FROM labels WHERE owner')) return { results: [LABEL_ROW] }
            if (sql.includes('FROM transaction_labels tl')) {
              return { results: [{ transaction_id: 1, label_id: 2 }] }
            }
            return { results: [] }
          },
        }),
      }),
    },
  } as unknown as Env
}

describe('loadDataset — labels', () => {
  it('includes the owner’s labels', async () => {
    const dataset = await loadDataset(stubEnv(), OWNER)

    expect(dataset.labels).toEqual([
      { id: 2, name: 'Japan trip', color: '#10b981', sortOrder: 0, active: true },
    ])
  })

  it('attaches each transaction’s labelIds from the join, not the row itself', async () => {
    const dataset = await loadDataset(stubEnv(), OWNER)

    expect(dataset.transactions).toHaveLength(1)
    expect(dataset.transactions[0]?.labelIds).toEqual([2])
  })

  it('gives a transaction with no links an empty labelIds array, not undefined', async () => {
    const env = stubEnv()
    const prepare = env.DB.prepare
    env.DB.prepare = (sql: string) =>
      sql.includes('FROM transaction_labels tl')
        ? { bind: () => ({ all: async () => ({ results: [] }), first: async () => null }) }
        : prepare(sql)

    const dataset = await loadDataset(env, OWNER)

    expect(dataset.transactions[0]?.labelIds).toEqual([])
  })

  it('joins against labels, so a transaction_labels row whose label was deleted cannot surface', async () => {
    let capturedSql = ''
    const env = stubEnv()
    const prepare = env.DB.prepare
    env.DB.prepare = (sql: string) => {
      if (sql.includes('FROM transaction_labels tl')) capturedSql = sql
      return prepare(sql)
    }

    await loadDataset(env, OWNER)

    expect(capturedSql).toMatch(/JOIN labels l ON l\.id = tl\.label_id/)
  })
})
