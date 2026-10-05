import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../../../_shared/env'
import { invokePagesRoute } from '../../../_shared/invokePagesRoute'
import { createInMemoryAccessDb } from '../../../_shared/testing/inMemoryAccessDb'
import { invokeExpenseApiRoute } from '../../../_shared/testing/invokeExpenseApiRoute'
import { inMemoryExpenseRepository } from '../../../../src/testing/inMemoryExpenseRepository'
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

describe('PATCH /api/expenses/transactions/bulk renaming descriptions', () => {
  const OWNER = 'owner@example.com'
  const URL = 'https://expenses.test/api/expenses/transactions/bulk'

  function setup() {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER, { groups: ['expenses'] })
    const env: Env = { DB: store.db, OWNER_EMAIL: OWNER }
    const base = {
      date: '2026-09-10',
      budgetMonth: '2026-09',
      accountId: 1,
      categoryId: 1,
      type: 'expense' as const,
      amountCents: 1_299,
      cancelled: false,
    }
    const repo = inMemoryExpenseRepository(
      {
        accounts: [{ id: 1, name: 'Main', kind: 'debit', settlement: 'immediate', active: true }],
        categories: [{ id: 1, name: 'Fun', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
        transactions: [
          { ...base, id: 1, description: 'NETFLIX.COM' },
          { ...base, id: 2, description: 'Netflix 0912' },
          { ...base, id: 3, description: 'Rent' },
        ],
      },
      OWNER,
    )
    return { env, repo }
  }

  function rename(env: Env, repo: ReturnType<typeof setup>['repo'], patch: unknown) {
    return invokeExpenseApiRoute({
      handler: onRequestPatch,
      repo,
      env,
      url: URL,
      method: 'PATCH',
      body: { ids: [1, 2], patch },
      email: OWNER,
    })
  }

  it('renames the chosen rows to one trimmed description and leaves the rest', async () => {
    const { env, repo } = setup()

    const response = await rename(env, repo, { description: '  Netflix ' })

    expect(response.status).toBe(200)
    const body = (await response.json()) as { updated: number }
    expect(body.updated).toBe(2)
    const stored = (await repo.loadDataset(OWNER)).transactions
    expect(stored.map((t) => t.description)).toEqual(['Netflix', 'Netflix', 'Rent'])
    expect(stored[0]?.amountCents).toBe(1_299)
  })

  it.each([
    ['blank', '', 'description cannot be blank'],
    ['spaces only', '   ', 'description cannot be blank'],
    ['too long', 'x'.repeat(141), 'description must be 140 characters or fewer'],
    ['not text', 42, 'description must be text'],
  ])('refuses a %s description and changes nothing', async (_label, description, message) => {
    const { env, repo } = setup()

    const response = await rename(env, repo, { description })

    await expectApiError(response, 400, message)
    const stored = (await repo.loadDataset(OWNER)).transactions
    expect(stored.map((t) => t.description)).toEqual(['NETFLIX.COM', 'Netflix 0912', 'Rent'])
  })
})
