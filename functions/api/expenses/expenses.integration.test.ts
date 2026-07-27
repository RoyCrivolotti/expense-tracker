import { describe, expect, it } from 'vitest'
import type { Env } from '../../_shared/env'
import { createInMemoryAccessDb } from '../../_shared/testing/inMemoryAccessDb'
import { invokeExpenseApiRoute } from '../../_shared/testing/invokeExpenseApiRoute'
import { inMemoryExpenseRepository } from '../../../src/testing/inMemoryExpenseRepository'
import { onRequestPost as createAccount } from './accounts/index'
import { onRequestPatch as patchAccount, onRequestDelete as deleteAccount } from './accounts/[id]'
import { onRequestPost as createCategory } from './categories/index'
import {
  onRequestPatch as patchCategory,
  onRequestDelete as deleteCategory,
} from './categories/[id]'
import { onRequestPut as putSettings } from './settings/index'
import { onRequestPut as putGoals } from './goals/index'
import { onRequestPost as createScenario } from './scenarios/index'
import { onRequestPatch as patchScenario, onRequestDelete as deleteScenario } from './scenarios/[id]'
import { onRequestPut as putStatement } from './statements/index'

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

  it('persists statement paidOn and rejects paid without a date', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER, { groups: ['expenses'] })
    const repo = inMemoryExpenseRepository({}, OWNER)
    const card = await invokeExpenseApiRoute({
      handler: createAccount,
      repo,
      env: expenseEnv(store),
      url: 'https://expenses.test/api/expenses/accounts',
      method: 'POST',
      body: { name: 'Iberia Icon', kind: 'credit', settlement: 'deferred', active: true },
      email: OWNER,
    })
    const account = await readJson<{ id: number }>(card)

    const saved = await invokeExpenseApiRoute({
      handler: putStatement,
      repo,
      env: expenseEnv(store),
      method: 'PUT',
      url: 'https://expenses.test/api/expenses/statements',
      body: { accountId: account.id, yearMonth: '2026-06', paid: true, paidOn: '2026-07-15' },
      email: OWNER,
    })
    expect(saved.status).toBe(200)
    expect(await readJson<{ paid: boolean; paidOn?: string }>(saved)).toMatchObject({
      paid: true,
      paidOn: '2026-07-15',
    })

    const missingDate = await invokeExpenseApiRoute({
      handler: putStatement,
      repo,
      env: expenseEnv(store),
      method: 'PUT',
      url: 'https://expenses.test/api/expenses/statements',
      body: { accountId: account.id, yearMonth: '2026-07', paid: true },
      email: OWNER,
    })
    expect(missingDate.status).toBe(400)
  })

  it('deletes an unused category outright', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER, { groups: ['expenses'] })
    const repo = inMemoryExpenseRepository(
      {
        categories: [{ id: 1, name: 'Unused', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
      },
      OWNER,
    )

    const deleted = await invokeExpenseApiRoute({
      handler: deleteCategory,
      repo,
      env: expenseEnv(store),
      method: 'DELETE',
      url: 'https://expenses.test/api/expenses/categories/1',
      params: { id: '1' },
      body: {},
      email: OWNER,
    })
    expect(deleted.status).toBe(200)
    expect(await readJson(deleted)).toEqual({ reassignedToId: null })
    expect((await repo.loadDataset(OWNER)).categories).toHaveLength(0)
  })

  it('blocks deleting a category in use, then reassigns its transactions and deletes it', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER, { groups: ['expenses'] })
    const repo = inMemoryExpenseRepository(
      {
        categories: [
          { id: 1, name: 'Dining out', monthlyBudgetCents: 0, sortOrder: 0, active: true },
          { id: 2, name: 'Eating out', monthlyBudgetCents: 0, sortOrder: 1, active: true },
        ],
        accounts: [{ id: 1, name: 'Checking', kind: 'debit', settlement: 'immediate', active: true }],
        transactions: [
          {
            id: 1,
            date: '2026-01-01',
            budgetMonth: '2026-01',
            description: 'Lunch',
            accountId: 1,
            categoryId: 1,
            type: 'expense',
            amountCents: -1200,
            cancelled: false,
            status: 'posted',
          },
        ],
      },
      OWNER,
    )

    const blocked = await invokeExpenseApiRoute({
      handler: deleteCategory,
      repo,
      env: expenseEnv(store),
      method: 'DELETE',
      url: 'https://expenses.test/api/expenses/categories/1',
      params: { id: '1' },
      body: {},
      email: OWNER,
    })
    expect(blocked.status).toBe(409)

    const reassigned = await invokeExpenseApiRoute({
      handler: deleteCategory,
      repo,
      env: expenseEnv(store),
      method: 'DELETE',
      url: 'https://expenses.test/api/expenses/categories/1',
      params: { id: '1' },
      body: { reassignToId: 2 },
      email: OWNER,
    })
    expect(reassigned.status).toBe(200)
    expect(await readJson(reassigned)).toEqual({ reassignedToId: 2 })

    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.categories.map((c) => c.id)).toEqual([2])
    expect(dataset.transactions[0]?.categoryId).toBe(2)
  })

  it('deletes a category in use by creating a new target inline', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER, { groups: ['expenses'] })
    const repo = inMemoryExpenseRepository(
      {
        categories: [{ id: 1, name: 'Dinig out', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
        accounts: [{ id: 1, name: 'Checking', kind: 'debit', settlement: 'immediate', active: true }],
        transactions: [
          {
            id: 1,
            date: '2026-01-01',
            budgetMonth: '2026-01',
            description: 'Lunch',
            accountId: 1,
            categoryId: 1,
            type: 'expense',
            amountCents: -1200,
            cancelled: false,
            status: 'posted',
          },
        ],
      },
      OWNER,
    )

    const response = await invokeExpenseApiRoute({
      handler: deleteCategory,
      repo,
      env: expenseEnv(store),
      method: 'DELETE',
      url: 'https://expenses.test/api/expenses/categories/1',
      params: { id: '1' },
      body: {
        createCategory: { name: 'Dining out', monthlyBudgetCents: 0, sortOrder: 0, active: true },
      },
      email: OWNER,
    })
    expect(response.status).toBe(200)
    const body = await readJson<{ reassignedToId: number; createdCategory: { name: string } }>(
      response,
    )
    expect(body.createdCategory.name).toBe('Dining out')

    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.categories).toHaveLength(1)
    expect(dataset.categories[0]?.id).toBe(body.reassignedToId)
    expect(dataset.transactions[0]?.categoryId).toBe(body.reassignedToId)
  })

  it('blocks deleting an account in use, then reassigns its transactions and statements and deletes it', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER, { groups: ['expenses'] })
    const repo = inMemoryExpenseRepository(
      {
        accounts: [
          { id: 1, name: 'Old card', kind: 'credit', settlement: 'deferred', active: true },
          { id: 2, name: 'New card', kind: 'credit', settlement: 'deferred', active: true },
        ],
        categories: [{ id: 1, name: 'Dining out', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
        transactions: [
          {
            id: 1,
            date: '2026-01-01',
            budgetMonth: '2026-01',
            description: 'Lunch',
            accountId: 1,
            categoryId: 1,
            type: 'expense',
            amountCents: -1200,
            cancelled: false,
            status: 'posted',
          },
        ],
        accountStatements: [{ accountId: 1, yearMonth: '2026-01', paid: false }],
      },
      OWNER,
    )

    const blocked = await invokeExpenseApiRoute({
      handler: deleteAccount,
      repo,
      env: expenseEnv(store),
      method: 'DELETE',
      url: 'https://expenses.test/api/expenses/accounts/1',
      params: { id: '1' },
      body: {},
      email: OWNER,
    })
    expect(blocked.status).toBe(409)

    const reassigned = await invokeExpenseApiRoute({
      handler: deleteAccount,
      repo,
      env: expenseEnv(store),
      method: 'DELETE',
      url: 'https://expenses.test/api/expenses/accounts/1',
      params: { id: '1' },
      body: { reassignToId: 2 },
      email: OWNER,
    })
    expect(reassigned.status).toBe(200)
    expect(await readJson(reassigned)).toEqual({ reassignedToId: 2 })

    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.accounts.map((a) => a.id)).toEqual([2])
    expect(dataset.transactions[0]?.accountId).toBe(2)
    expect(dataset.accountStatements).toEqual([{ accountId: 2, yearMonth: '2026-01', paid: false }])
  })

  it('drops the source statement for a month the target already has, keeping the target as-is', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER, { groups: ['expenses'] })
    const repo = inMemoryExpenseRepository(
      {
        accounts: [
          { id: 1, name: 'Old card', kind: 'credit', settlement: 'deferred', active: true },
          { id: 2, name: 'New card', kind: 'credit', settlement: 'deferred', active: true },
        ],
        accountStatements: [
          // Both accounts have a January statement; the source's is unpaid, the
          // target's is already paid. The target's row must win the collision.
          { accountId: 1, yearMonth: '2026-01', paid: false },
          { accountId: 2, yearMonth: '2026-01', paid: true, paidOn: '2026-02-01' },
          // February only exists on the source, so it should move over untouched.
          { accountId: 1, yearMonth: '2026-02', paid: false },
        ],
      },
      OWNER,
    )

    const reassigned = await invokeExpenseApiRoute({
      handler: deleteAccount,
      repo,
      env: expenseEnv(store),
      method: 'DELETE',
      url: 'https://expenses.test/api/expenses/accounts/1',
      params: { id: '1' },
      body: { reassignToId: 2 },
      email: OWNER,
    })
    expect(reassigned.status).toBe(200)

    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.accountStatements).toEqual(
      expect.arrayContaining([
        { accountId: 2, yearMonth: '2026-01', paid: true, paidOn: '2026-02-01' },
        { accountId: 2, yearMonth: '2026-02', paid: false },
      ]),
    )
    expect(dataset.accountStatements).toHaveLength(2)
  })

  it('moves settings.defaultAccountId along when the default account is deleted-with-reassign', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER, { groups: ['expenses'] })
    const repo = inMemoryExpenseRepository(
      {
        accounts: [
          { id: 1, name: 'Checking', kind: 'debit', settlement: 'immediate', active: true },
          { id: 2, name: 'Savings', kind: 'debit', settlement: 'immediate', active: true },
        ],
        settings: { defaultAccountId: 1 },
      },
      OWNER,
    )

    const reassigned = await invokeExpenseApiRoute({
      handler: deleteAccount,
      repo,
      env: expenseEnv(store),
      method: 'DELETE',
      url: 'https://expenses.test/api/expenses/accounts/1',
      params: { id: '1' },
      body: { reassignToId: 2 },
      email: OWNER,
    })
    expect(reassigned.status).toBe(200)

    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.settings.defaultAccountId).toBe(2)
  })

  it('clears settings.defaultAccountId when the (unused) default account is plain-deleted', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER, { groups: ['expenses'] })
    const repo = inMemoryExpenseRepository(
      {
        accounts: [
          { id: 1, name: 'Checking', kind: 'debit', settlement: 'immediate', active: true },
          { id: 2, name: 'Savings', kind: 'debit', settlement: 'immediate', active: true },
        ],
        settings: { defaultAccountId: 1 },
      },
      OWNER,
    )

    const deleted = await invokeExpenseApiRoute({
      handler: deleteAccount,
      repo,
      env: expenseEnv(store),
      method: 'DELETE',
      url: 'https://expenses.test/api/expenses/accounts/1',
      params: { id: '1' },
      body: {},
      email: OWNER,
    })
    expect(deleted.status).toBe(200)

    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.settings.defaultAccountId).toBeNull()
  })
})
