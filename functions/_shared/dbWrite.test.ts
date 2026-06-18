import { describe, expect, it, vi } from 'vitest'
import { insertTransaction, updateTransaction } from './dbWrite'
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
