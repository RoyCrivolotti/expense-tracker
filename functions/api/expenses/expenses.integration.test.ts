import { describe, expect, it } from 'vitest'
import { inMemoryExpenseRepository } from '../../../src/testing/inMemoryExpenseRepository'
import { invokeExpenseRoute } from '../../_shared/testing/invokeExpenseRoute'
import { onRequestPost as createAccount } from './accounts/index'
import { onRequestPatch as patchAccount } from './accounts/[id]'
import { onRequestPost as createCategory } from './categories/index'
import { onRequestPatch as patchCategory } from './categories/[id]'
import { onRequestPut as putSettings } from './settings/index'
import { onRequestPut as putGoals } from './goals/index'
import { onRequestPost as createScenario } from './scenarios/index'
import { onRequestPatch as patchScenario, onRequestDelete as deleteScenario } from './scenarios/[id]'

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

  it('creates, updates, and deletes a goal scenario', async () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    const created = await invokeExpenseRoute({
      handler: createScenario,
      repo,
      owner: OWNER,
      url: 'https://expenses.test/api/expenses/scenarios',
      body: {
        name: 'Path 2',
        color: '#6366f1',
        sortOrder: 0,
        startInvestedCents: 100000000,
        monthlyContributionCents: 50000,
        annualContributionGrowth: 0,
        expectedRealReturn: 0.07,
        horizonYears: 30,
        housePriceCents: 400000000,
        downPaymentFraction: 0.3,
        housePurchaseYear: null,
        transactionCostsCents: 800000,
        mortgageTermYears: 30,
        mortgageRateAnnual: 0.02,
        houseAppreciationRate: 0.025,
        rentMonthlyCents: 150000,
        annualSpendCents: 4000000,
        safeWithdrawalRate: 0.04,
      },
    })
    expect(created.status).toBe(201)
    const scenario = await readJson<{ id: number; name: string }>(created)
    expect(scenario.name).toBe('Path 2')

    const updated = await invokeExpenseRoute({
      handler: patchScenario,
      repo,
      owner: OWNER,
      method: 'PATCH',
      url: `https://expenses.test/api/expenses/scenarios/${scenario.id}`,
      params: { id: String(scenario.id) },
      body: { name: 'Path 2 updated' },
    })
    expect(updated.status).toBe(200)
    expect((await readJson<{ name: string }>(updated)).name).toBe('Path 2 updated')

    const deleted = await invokeExpenseRoute({
      handler: deleteScenario,
      repo,
      owner: OWNER,
      method: 'DELETE',
      url: `https://expenses.test/api/expenses/scenarios/${scenario.id}`,
      params: { id: String(scenario.id) },
    })
    expect(deleted.status).toBe(200)
    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.goalScenarios).toHaveLength(0)
  })
})
