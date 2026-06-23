import { describe, expect, it } from 'vitest'
import { inMemoryExpenseRepository } from '../../../src/testing/inMemoryExpenseRepository'
import { invokeExpenseRoute } from '../../_shared/testing/invokeExpenseRoute'
import { onRequestPost as createAccount } from './accounts/index'
import { onRequestPatch as patchAccount } from './accounts/[id]'
import { onRequestPost as createCategory } from './categories/index'
import { onRequestPatch as patchCategory } from './categories/[id]'
import { onRequestPut as putSettings } from './settings/index'
import { onRequestPut as putGoals } from './goals/index'

const OWNER = 'owner@example.com'

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

describe('expenses API (handlers + in-memory repo)', () => {
  it('creates and updates an account', async () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    const created = await invokeExpenseRoute({
      handler: createAccount,
      repo,
      owner: OWNER,
      url: 'https://expenses.test/api/expenses/accounts',
      body: { name: 'Checking', kind: 'debit', settlement: 'immediate', active: true },
    })
    expect(created.status).toBe(201)
    const account = await readJson<{ id: number; name: string }>(created)
    expect(account.name).toBe('Checking')

    const updated = await invokeExpenseRoute({
      handler: patchAccount,
      repo,
      owner: OWNER,
      method: 'PATCH',
      url: `https://expenses.test/api/expenses/accounts/${account.id}`,
      params: { id: String(account.id) },
      body: { name: 'Main checking' },
    })
    expect(updated.status).toBe(200)
    expect((await readJson<{ name: string }>(updated)).name).toBe('Main checking')
  })

  it('creates and updates a category', async () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    const created = await invokeExpenseRoute({
      handler: createCategory,
      repo,
      owner: OWNER,
      url: 'https://expenses.test/api/expenses/categories',
      body: {
        name: 'Groceries',
        monthlyBudgetCents: 50000,
        sortOrder: 1,
        active: true,
      },
    })
    expect(created.status).toBe(201)
    const category = await readJson<{ id: number; name: string }>(created)
    expect(category.name).toBe('Groceries')

    const updated = await invokeExpenseRoute({
      handler: patchCategory,
      repo,
      owner: OWNER,
      method: 'PATCH',
      url: `https://expenses.test/api/expenses/categories/${category.id}`,
      params: { id: String(category.id) },
      body: { monthlyBudgetCents: 60000 },
    })
    expect(updated.status).toBe(200)
    expect((await readJson<{ monthlyBudgetCents: number }>(updated)).monthlyBudgetCents).toBe(
      60000,
    )
  })

  it('updates settings including defaultAccountId', async () => {
    const repo = inMemoryExpenseRepository(
      {
        accounts: [{ id: 1, name: 'Card', kind: 'credit', settlement: 'deferred', active: true }],
      },
      OWNER,
    )
    const response = await invokeExpenseRoute({
      handler: putSettings,
      repo,
      owner: OWNER,
      method: 'PUT',
      url: 'https://expenses.test/api/expenses/settings',
      body: { openingCashCents: 100000, defaultAccountId: 1 },
    })
    expect(response.status).toBe(200)
    const settings = await readJson<{ openingCashCents: number; defaultAccountId: number | null }>(
      response,
    )
    expect(settings.openingCashCents).toBe(100000)
    expect(settings.defaultAccountId).toBe(1)
  })

  it('updates goal inputs', async () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    const response = await invokeExpenseRoute({
      handler: putGoals,
      repo,
      owner: OWNER,
      method: 'PUT',
      url: 'https://expenses.test/api/expenses/goals',
      body: {
        housePriceCents: 400000000,
        downPaymentFraction: 0.4,
        mortgageTermYears: 30,
        mortgageRateAnnual: 0.02,
      },
    })
    expect(response.status).toBe(200)
    const goals = await readJson<{ housePriceCents: number; downPaymentFraction: number }>(
      response,
    )
    expect(goals.housePriceCents).toBe(400000000)
    expect(goals.downPaymentFraction).toBe(0.4)
  })
})
