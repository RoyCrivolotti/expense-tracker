import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../../../_shared/env'
import { invokePagesRoute } from '../../../_shared/invokePagesRoute'
import { onRequestPatch } from './bulk'

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

async function expectApiError(
  response: Response,
  status: number,
  message: string,
): Promise<void> {
  expect(response.status).toBe(status)
  expect(await response.json()).toEqual({ error: message })
}

describe('PATCH /api/expenses/transactions/bulk', () => {
  it('returns 401 without Access email', async () => {
    const response = await invokePagesRoute(onRequestPatch, {
      env: envWith(null),
      method: 'PATCH',
      email: false,
      body: { ids: [1], patch: { categoryId: 1 } },
    })
    await expectApiError(response, 401, 'Not authenticated')
  })

  it('returns 400 for invalid ids', async () => {
    const response = await invokePagesRoute(onRequestPatch, {
      env: envWith(null),
      method: 'PATCH',
      body: { ids: 'not-an-array', patch: { categoryId: 1 } },
    })
    await expectApiError(response, 400, 'ids must be an array')
  })

  it('returns 400 for empty patch', async () => {
    const response = await invokePagesRoute(onRequestPatch, {
      env: envWith(null),
      method: 'PATCH',
      body: { ids: [1], patch: {} },
    })
    await expectApiError(response, 400, 'At least one field must be set')
  })

  it('returns 400 for foreign accountId', async () => {
    const response = await invokePagesRoute(onRequestPatch, {
      env: envWith(null),
      method: 'PATCH',
      body: { ids: [1], patch: { accountId: 99 } },
    })
    await expectApiError(response, 400, 'Invalid accountId')
  })
})
