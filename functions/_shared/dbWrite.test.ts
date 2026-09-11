import { describe, expect, it, vi } from 'vitest'
import { insertTransaction, updateTransaction, bulkUpdateTransactions } from './dbWrite'
import type { Env } from './env'

function envWith(first: unknown): Env {
  return {
    DB: {
      prepare: () => ({
        bind: () => ({
          first: vi.fn().mockResolvedValue(first),
        }),
      }),
    },
  } as unknown as Env
}

function envForBulkUpdate(opts: {
  ownedAccount?: boolean
  ownedCategory?: boolean
}): Env {
  const { ownedAccount = true, ownedCategory = true } = opts
  const txnRow = {
    id: 1,
    owner: 'a@b.com',
    date: '2026-01-01',
    budget_month: '2026-01',
    description: 'Test',
    account_id: 1,
    category_id: 2,
    type: 'expense',
    amount_cents: -1000,
    cancelled: 0,
    notes: null,
    plan_id: null,
    installment_index: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
  return {
    DB: {
      prepare: (sql: string) => ({
        bind: () => {
          if (sql.includes('accounts') && sql.includes('SELECT 1')) {
            return { first: vi.fn().mockResolvedValue(ownedAccount ? { ok: 1 } : null) }
          }
          if (sql.includes('categories') && sql.includes('SELECT 1')) {
            return { first: vi.fn().mockResolvedValue(ownedCategory ? { ok: 1 } : null) }
          }
          if (sql.includes('UPDATE transactions')) {
            return { run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }) }
          }
          if (sql.includes('SELECT * FROM transactions')) {
            return { all: vi.fn().mockResolvedValue({ results: [txnRow] }) }
          }
          if (sql.includes('SELECT * FROM accounts')) {
            return { first: vi.fn().mockResolvedValue(null) }
          }
          if (sql.includes('account_statements')) {
            return { first: vi.fn().mockResolvedValue(null) }
          }
          return { first: vi.fn().mockResolvedValue(null) }
        },
      }),
    },
  } as unknown as Env
}

const baseTxn = {
  date: '2026-01-01',
  budgetMonth: '2026-01',
  description: 'Test',
  accountId: 1,
  categoryId: 2,
  type: 'expense' as const,
  amountCents: -1000,
  cancelled: false,
}

describe('owner-scoped writes', () => {
  it('insertTransaction rejects foreign accountId', async () => {
    await expect(insertTransaction(envWith(null), 'a@b.com', baseTxn)).rejects.toMatchObject({
      status: 400,
      message: 'Invalid accountId',
    })
  })

  it('insertTransaction rejects foreign categoryId', async () => {
    const env = {
      DB: {
        prepare: (sql: string) => ({
          bind: () => ({
            first: vi.fn().mockImplementation(async () => {
              if (sql.includes('categories')) return null
              return { ok: 1 }
            }),
          }),
        }),
      },
    } as unknown as Env
    await expect(insertTransaction(env, 'a@b.com', baseTxn)).rejects.toMatchObject({
      status: 400,
      message: 'Invalid categoryId',
    })
  })

  it('updateTransaction rejects foreign accountId on patch', async () => {
    await expect(
      updateTransaction(envWith(null), 'a@b.com', 5, { accountId: 99 }),
    ).rejects.toMatchObject({ status: 400, message: 'Invalid accountId' })
  })
})

describe('bulkUpdateTransactions', () => {
  it('returns empty array for empty ids', async () => {
    const result = await bulkUpdateTransactions(envWith(null), 'a@b.com', [], { categoryId: 1 })
    expect(result).toEqual([])
  })

  it('rejects foreign accountId', async () => {
    await expect(
      bulkUpdateTransactions(envForBulkUpdate({ ownedAccount: false }), 'a@b.com', [1], {
        accountId: 99,
      }),
    ).rejects.toMatchObject({ status: 400, message: 'Invalid accountId' })
  })

  it('rejects foreign categoryId', async () => {
    await expect(
      bulkUpdateTransactions(envForBulkUpdate({ ownedCategory: false }), 'a@b.com', [1], {
        categoryId: 99,
      }),
    ).rejects.toMatchObject({ status: 400, message: 'Invalid categoryId' })
  })

  it('updates and returns transactions for valid patch', async () => {
    const result = await bulkUpdateTransactions(envForBulkUpdate({}), 'a@b.com', [1], {
      categoryId: 2,
    })
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe(1)
    expect(result[0]!.status).toBe('posted')
  })
})
