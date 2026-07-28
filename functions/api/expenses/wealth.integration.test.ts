import { describe, expect, it } from 'vitest'
import type { Env } from '../../_shared/env'
import { createInMemoryAccessDb } from '../../_shared/testing/inMemoryAccessDb'
import { invokeExpenseApiRoute } from '../../_shared/testing/invokeExpenseApiRoute'
import { inMemoryExpenseRepository } from '../../../src/testing/inMemoryExpenseRepository'
import type { WealthAccount, WealthCheckin } from '../../../src/types'
import { onRequestPost as createWealthAccountHandler } from './wealth-accounts/index'
import {
  onRequestPatch as patchWealthAccountHandler,
  onRequestDelete as deleteWealthAccountHandler,
} from './wealth-accounts/[id]'
import { onRequestPost as createWealthCheckinHandler } from './wealth-checkins/index'
import {
  onRequestPatch as patchWealthCheckinHandler,
  onRequestDelete as deleteWealthCheckinHandler,
} from './wealth-checkins/[id]'

const OWNER = 'owner@example.com'
const GUEST = 'guest@example.com'

function expenseEnv(store: ReturnType<typeof createInMemoryAccessDb>): Env {
  return { DB: store.db, OWNER_EMAIL: OWNER }
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

describe('wealth accounts API', () => {
  it('creates a wealth account', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER, { groups: ['expenses'] })
    const repo = inMemoryExpenseRepository({}, OWNER)

    const response = await invokeExpenseApiRoute({
      handler: createWealthAccountHandler,
      repo,
      env: expenseEnv(store),
      url: 'https://expenses.test/api/expenses/wealth-accounts',
      method: 'POST',
      body: { name: 'Broker', kind: 'investment', sortOrder: 0, archived: false },
      email: OWNER,
    })

    expect(response.status).toBe(201)
    const account = await readJson<WealthAccount>(response)
    expect(account.name).toBe('Broker')
    expect(account.kind).toBe('investment')
    expect(account.id).toBeGreaterThan(0)
  })

  it('patches a wealth account', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER, { groups: ['expenses'] })
    const repo = inMemoryExpenseRepository({}, OWNER)
    const created = await repo.createWealthAccount(OWNER, {
      name: 'Savings',
      kind: 'cash',
      sortOrder: 0,
      archived: false,
    })

    const response = await invokeExpenseApiRoute({
      handler: patchWealthAccountHandler,
      repo,
      env: expenseEnv(store),
      url: `https://expenses.test/api/expenses/wealth-accounts/${created.id}`,
      method: 'PATCH',
      params: { id: String(created.id) },
      body: { sortOrder: 2 },
      email: OWNER,
    })

    expect(response.status).toBe(200)
    const account = await readJson<WealthAccount>(response)
    expect(account.sortOrder).toBe(2)
  })

  it('deletes a wealth account', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER, { groups: ['expenses'] })
    const repo = inMemoryExpenseRepository({}, OWNER)
    const created = await repo.createWealthAccount(OWNER, {
      name: 'Old Account',
      kind: 'other_asset',
      sortOrder: 0,
      archived: false,
    })

    const response = await invokeExpenseApiRoute({
      handler: deleteWealthAccountHandler,
      repo,
      env: expenseEnv(store),
      url: `https://expenses.test/api/expenses/wealth-accounts/${created.id}`,
      method: 'DELETE',
      params: { id: String(created.id) },
      email: OWNER,
    })

    expect(response.status).toBe(200)
    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.wealthAccounts).toHaveLength(0)
  })

  it('returns 403 without expenses group', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(GUEST, { grantedBy: OWNER, groups: ['finance'] })
    const repo = inMemoryExpenseRepository({}, GUEST)

    const response = await invokeExpenseApiRoute({
      handler: createWealthAccountHandler,
      repo,
      env: expenseEnv(store),
      url: 'https://expenses.test/api/expenses/wealth-accounts',
      method: 'POST',
      body: { name: 'X', kind: 'cash', sortOrder: 0, archived: false },
      email: GUEST,
    })

    expect(response.status).toBe(403)
  })
})

describe('wealth checkins API', () => {
  it('creates a check-in with entries', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER, { groups: ['expenses'] })
    const repo = inMemoryExpenseRepository({}, OWNER)
    const account = await repo.createWealthAccount(OWNER, {
      name: 'Broker',
      kind: 'investment',
      sortOrder: 0,
      archived: false,
    })

    const response = await invokeExpenseApiRoute({
      handler: createWealthCheckinHandler,
      repo,
      env: expenseEnv(store),
      url: 'https://expenses.test/api/expenses/wealth-checkins',
      method: 'POST',
      body: {
        checkinDate: '2024-06-01',
        note: 'Q2',
        entries: [{ accountId: account.id, valueCents: 50_000_000 }],
      },
      email: OWNER,
    })

    expect(response.status).toBe(201)
    const checkin = await readJson<WealthCheckin>(response)
    expect(checkin.checkinDate).toBe('2024-06-01')
    expect(checkin.note).toBe('Q2')
    expect(checkin.entries[0]!.valueCents).toBe(50_000_000)
  })

  it('patches a check-in date', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER, { groups: ['expenses'] })
    const repo = inMemoryExpenseRepository({}, OWNER)
    const checkin = await repo.createWealthCheckin(OWNER, {
      checkinDate: '2024-06-01',
      entries: [],
    })

    const response = await invokeExpenseApiRoute({
      handler: patchWealthCheckinHandler,
      repo,
      env: expenseEnv(store),
      url: `https://expenses.test/api/expenses/wealth-checkins/${checkin.id}`,
      method: 'PATCH',
      params: { id: String(checkin.id) },
      body: { checkinDate: '2024-07-01' },
      email: OWNER,
    })

    expect(response.status).toBe(200)
    const updated = await readJson<WealthCheckin>(response)
    expect(updated.checkinDate).toBe('2024-07-01')
  })

  it('deletes a check-in', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER, { groups: ['expenses'] })
    const repo = inMemoryExpenseRepository({}, OWNER)
    const checkin = await repo.createWealthCheckin(OWNER, {
      checkinDate: '2024-06-01',
      entries: [],
    })

    const response = await invokeExpenseApiRoute({
      handler: deleteWealthCheckinHandler,
      repo,
      env: expenseEnv(store),
      url: `https://expenses.test/api/expenses/wealth-checkins/${checkin.id}`,
      method: 'DELETE',
      params: { id: String(checkin.id) },
      email: OWNER,
    })

    expect(response.status).toBe(200)
    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.wealthCheckins).toHaveLength(0)
  })

  it('returns 400 for invalid date format', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER, { groups: ['expenses'] })
    const repo = inMemoryExpenseRepository({}, OWNER)

    const response = await invokeExpenseApiRoute({
      handler: createWealthCheckinHandler,
      repo,
      env: expenseEnv(store),
      url: 'https://expenses.test/api/expenses/wealth-checkins',
      method: 'POST',
      body: { checkinDate: 'not-a-date', entries: [] },
      email: OWNER,
    })

    expect(response.status).toBe(400)
  })
})
