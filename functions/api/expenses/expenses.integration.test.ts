import { describe, expect, it } from 'vitest'
import type { Env } from '../../_shared/env'
import { createInMemoryAccessDb } from '../../_shared/testing/inMemoryAccessDb'
import { invokeExpenseApiRoute } from '../../_shared/testing/invokeExpenseApiRoute'
import { inMemoryExpenseRepository } from '../../../src/testing/inMemoryExpenseRepository'
import { onRequestPost as createAccount } from './accounts/index'
import { onRequestPatch as patchAccount } from './accounts/[id]'
import { onRequestPost as createCategory } from './categories/index'
import { onRequestPatch as patchCategory } from './categories/[id]'
import { onRequestPut as putSettings } from './settings/index'
import { onRequestPut as putGoals } from './goals/index'
import { onRequestPost as createScenario } from './scenarios/index'
import { onRequestPatch as patchScenario, onRequestDelete as deleteScenario } from './scenarios/[id]'

const OWNER = 'owner@example.com'
const GUEST = 'guest@example.com'

function expenseEnv(store: ReturnType<typeof createInMemoryAccessDb>): Env {
  return { DB: store.db, OWNER_EMAIL: OWNER }
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

describe('expenses API (middleware + handlers + in-memory repo)', () => {
  it('returns 403 without the expenses group grant', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(GUEST, { grantedBy: OWNER, groups: ['finance'] })
    const repo = inMemoryExpenseRepository({}, GUEST)
    const response = await invokeExpenseApiRoute({
      handler: createAccount,
      repo,
      env: expenseEnv(store),
      url: 'https://expenses.test/api/expenses/accounts',
      method: 'POST',
      body: { name: 'Checking', kind: 'debit', settlement: 'immediate', active: true },
      email: GUEST,
    })
    expect(response.status).toBe(403)
  })

  it('creates and updates an account', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER, { groups: ['expenses'] })
    const repo = inMemoryExpenseRepository({}, OWNER)
    const created = await invokeExpenseApiRoute({
      handler: createAccount,
      repo,
      env: expenseEnv(store),
      url: 'https://expenses.test/api/expenses/accounts',
      method: 'POST',
      body: { name: 'Checking', kind: 'debit', settlement: 'immediate', active: true },
      email: OWNER,
    })
    expect(created.status).toBe(201)
    const account = await readJson<{ id: number; name: string }>(created)
    expect(account.name).toBe('Checking')

    const updated = await invokeExpenseApiRoute({
      handler: patchAccount,
      repo,
      env: expenseEnv(store),
      method: 'PATCH',
      url: `https://expenses.test/api/expenses/accounts/${account.id}`,
      params: { id: String(account.id) },
      body: { name: 'Main checking' },
      email: OWNER,
    })
    expect(updated.status).toBe(200)
    expect((await readJson<{ name: string }>(updated)).name).toBe('Main checking')
  })

  it('creates and updates a category', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER, { groups: ['expenses'] })
    const repo = inMemoryExpenseRepository({}, OWNER)
    const created = await invokeExpenseApiRoute({
      handler: createCategory,
      repo,
      env: expenseEnv(store),
      url: 'https://expenses.test/api/expenses/categories',
      method: 'POST',
      body: {
        name: 'Groceries',
        monthlyBudgetCents: 50000,
        sortOrder: 1,
        active: true,
      },
      email: OWNER,
    })
    expect(created.status).toBe(201)
    const category = await readJson<{ id: number; name: string }>(created)
    expect(category.name).toBe('Groceries')

    const updated = await invokeExpenseApiRoute({
      handler: patchCategory,
      repo,
      env: expenseEnv(store),
      method: 'PATCH',
      url: `https://expenses.test/api/expenses/categories/${category.id}`,
      params: { id: String(category.id) },
      body: { monthlyBudgetCents: 60000 },
      email: OWNER,
    })
    expect(updated.status).toBe(200)
    expect((await readJson<{ monthlyBudgetCents: number }>(updated)).monthlyBudgetCents).toBe(
      60000,
    )
  })

  it('updates settings including defaultAccountId', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER, { groups: ['expenses'] })
    const repo = inMemoryExpenseRepository(
      {
        accounts: [{ id: 1, name: 'Card', kind: 'credit', settlement: 'deferred', active: true }],
      },
      OWNER,
    )
    const response = await invokeExpenseApiRoute({
      handler: putSettings,
      repo,
      env: expenseEnv(store),
      method: 'PUT',
      url: 'https://expenses.test/api/expenses/settings',
      body: { openingCashCents: 100000, defaultAccountId: 1 },
      email: OWNER,
    })
    expect(response.status).toBe(200)
    const settings = await readJson<{ openingCashCents: number; defaultAccountId: number | null }>(
      response,
    )
    expect(settings.openingCashCents).toBe(100000)
    expect(settings.defaultAccountId).toBe(1)
  })

  it('updates goal inputs', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER, { groups: ['expenses'] })
    const repo = inMemoryExpenseRepository({}, OWNER)
    const response = await invokeExpenseApiRoute({
      handler: putGoals,
      repo,
      env: expenseEnv(store),
      method: 'PUT',
      url: 'https://expenses.test/api/expenses/goals',
      body: {
        housePriceCents: 400_000_000,
        downPaymentFraction: 0.4,
        mortgageTermYears: 30,
        mortgageRateAnnual: 0.02,
      },
      email: OWNER,
    })
    expect(response.status).toBe(200)
    const goals = await readJson<{ housePriceCents: number; downPaymentFraction: number }>(
      response,
    )
    expect(goals.housePriceCents).toBe(400_000_000)
    expect(goals.downPaymentFraction).toBe(0.4)
  })

  it('creates, updates, and deletes a goal scenario', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER, { groups: ['expenses'] })
    const repo = inMemoryExpenseRepository({}, OWNER)
    const created = await invokeExpenseApiRoute({
      handler: createScenario,
      repo,
      env: expenseEnv(store),
      url: 'https://expenses.test/api/expenses/scenarios',
      method: 'POST',
      body: {
        name: 'Demo scenario',
        color: '#6366f1',
        sortOrder: 0,
        startInvestedCents: 1_000_000,
        monthlyContributionCents: 50_000,
        annualContributionGrowth: 0,
        expectedRealReturn: 0.07,
        horizonYears: 30,
        housePriceCents: 400_000_000,
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
      email: OWNER,
    })
    expect(created.status).toBe(201)
    const scenario = await readJson<{ id: number; name: string }>(created)
    expect(scenario.name).toBe('Demo scenario')

    const updated = await invokeExpenseApiRoute({
      handler: patchScenario,
      repo,
      env: expenseEnv(store),
      method: 'PATCH',
      url: `https://expenses.test/api/expenses/scenarios/${scenario.id}`,
      params: { id: String(scenario.id) },
      body: { name: 'Demo scenario updated' },
      email: OWNER,
    })
    expect(updated.status).toBe(200)
    expect((await readJson<{ name: string }>(updated)).name).toBe('Demo scenario updated')

    const deleted = await invokeExpenseApiRoute({
      handler: deleteScenario,
      repo,
      env: expenseEnv(store),
      method: 'DELETE',
      url: `https://expenses.test/api/expenses/scenarios/${scenario.id}`,
      params: { id: String(scenario.id) },
      email: OWNER,
    })
    expect(deleted.status).toBe(200)
    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.goalScenarios).toHaveLength(0)
  })
})
