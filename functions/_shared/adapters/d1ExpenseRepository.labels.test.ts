import { describe, expect, it, vi } from 'vitest'
import { createD1ExpenseRepository } from './d1ExpenseRepository'
import type { Env } from '../env'

/**
 * Only the labels dispatch entries — the rest of this file's wiring predates
 * labels and has no test of its own; adding one for every existing method
 * here is out of scope for this change.
 */
function stubEnv() {
  const prepare = vi.fn(() => ({
    bind: () => ({
      first: vi.fn().mockResolvedValue({
        id: 1,
        name: 'Japan trip',
        color: '#10b981',
        description: null,
        sort_order: 0,
        active: 1,
      }),
      all: vi.fn().mockResolvedValue({ results: [] }),
    }),
  }))
  const batch = vi.fn((stmts: unknown[]) => Promise.resolve(stmts.map(() => ({ meta: { changes: 1 } }))))
  return { DB: { prepare, batch } } as unknown as Env
}

const OWNER = 'owner@example.com'

describe('createD1ExpenseRepository — labels dispatch', () => {
  it('createLabel delegates to dbLabels with the same args', async () => {
    const repo = createD1ExpenseRepository(stubEnv())

    const label = await repo.createLabel(OWNER, {
      name: 'Japan trip',
      color: '#10b981',
      sortOrder: 0,
      active: true,
    })

    expect(label).toMatchObject({ id: 1, name: 'Japan trip' })
  })

  it('updateLabel delegates to dbLabels with the same args', async () => {
    const repo = createD1ExpenseRepository(stubEnv())

    const label = await repo.updateLabel(OWNER, 1, { name: 'Osaka trip' })

    expect(label).toMatchObject({ id: 1 })
  })

  it('deleteLabel delegates to dbLabels with the same args', async () => {
    const env = stubEnv()
    const repo = createD1ExpenseRepository(env)

    const result = await repo.deleteLabel(OWNER, 1)

    expect(result).toEqual({ unlabeled: 1 })
  })

  it('setTransactionLabels delegates to dbLabels with the same args', async () => {
    const env = stubEnv()
    const prepare = env.DB.prepare as ReturnType<typeof vi.fn>
    prepare.mockImplementation((sql: string) => ({
      bind: () => ({
        first: vi.fn().mockResolvedValue(
          sql.includes('SELECT * FROM transactions')
            ? {
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
                plan_id: null,
                installment_index: null,
                created_at: null,
                settled_by: null,
                report_count: null,
                report_covered_cents: null,
              }
            : { ok: 1 },
        ),
        all: vi.fn().mockResolvedValue({ results: [{ label_id: 2 }] }),
      }),
    }))
    const repo = createD1ExpenseRepository(env)

    const txn = await repo.setTransactionLabels(OWNER, 1, [2])

    expect(txn.labelIds).toEqual([2])
  })
})
