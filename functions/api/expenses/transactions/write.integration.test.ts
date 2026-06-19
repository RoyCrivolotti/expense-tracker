import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../../../_shared/env'
import { invokePagesRoute } from '../../../_shared/invokePagesRoute'
import { onRequestPost } from './index'
import { onRequestPatch } from './[id]'

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

function envRejectingForeignCategory(): Env {
  return {
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
}

const validTxn = {
  date: '2026-01-01',
  budgetMonth: '2026-01',
  description: 'Test',
  accountId: 1,
  categoryId: 2,
  type: 'expense' as const,
  amountCents: -1000,
  cancelled: false,
}

async function expectApiError(
  response: Response,
  status: number,
  message: string,
): Promise<void> {
  expect(response.status).toBe(status)
  expect(await response.json()).toEqual({ error: message })
}

describe('transaction write API (middleware + handler)', () => {
  it('POST returns 401 without Access email', async () => {
    const response = await invokePagesRoute(onRequestPost, {
      env: envWith(null),
      email: false,
      body: validTxn,
    })
    await expectApiError(response, 401, 'Not authenticated')
  })

  it('POST returns 400 for foreign accountId', async () => {
    const response = await invokePagesRoute(onRequestPost, {
      env: envWith(null),
      body: validTxn,
    })
    await expectApiError(response, 400, 'Invalid accountId')
  })

  it('POST returns 400 for foreign categoryId', async () => {
    const response = await invokePagesRoute(onRequestPost, {
      env: envRejectingForeignCategory(),
      body: validTxn,
    })
    await expectApiError(response, 400, 'Invalid categoryId')
  })

  it('PATCH returns 400 for foreign accountId', async () => {
    const response = await invokePagesRoute(onRequestPatch, {
      env: envWith(null),
      method: 'PATCH',
      url: 'https://expenses.test/api/expenses/transactions/5',
      params: { id: '5' },
      body: { accountId: 99 },
    })
    await expectApiError(response, 400, 'Invalid accountId')
  })
})
