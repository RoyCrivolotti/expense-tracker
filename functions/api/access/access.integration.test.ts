import { describe, expect, it } from 'vitest'
import type { Env } from '../../_shared/env'
import { createInMemoryAccessDb } from '../../_shared/testing/inMemoryAccessDb'
import { invokeApiRoute, middlewareProbeHandler } from '../../_shared/testing/invokeApiRoute'
import { onRequestGet as getGrants } from './grants'
import { onRequestGet as getGroups } from './groups'
import { onRequestGet as getStatus } from './status'
import { onRequestPost as approveRequest } from './admin/approve'
import { onRequestPatch as patchUserGrants } from './admin/users/[email]/grants'

const OWNER = 'owner@example.com'
const GUEST = 'guest@example.com'

function accessEnv(store: ReturnType<typeof createInMemoryAccessDb>): Env {
  return { DB: store.db, OWNER_EMAIL: OWNER }
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

describe('access API (middleware + routes + D1)', () => {
  it('returns 401 without Cloudflare Access email on grants', async () => {
    const store = createInMemoryAccessDb()
    const response = await invokeApiRoute({
      handler: getGrants,
      env: accessEnv(store),
      url: 'https://expenses.test/api/access/grants',
      email: false,
    })
    expect(response.status).toBe(401)
  })

  it('returns all groups for the owner on GET /api/access/grants', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER, { groups: ['expenses'] })
    const response = await invokeApiRoute({
      handler: getGrants,
      env: accessEnv(store),
      url: 'https://expenses.test/api/access/grants',
      email: OWNER,
    })
    expect(response.status).toBe(200)
    expect(await readJson(response)).toEqual({
      groups: { expenses: true, finance: true, legacy: true },
    })
  })

  it('returns stored group grants for an active guest', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(GUEST, {
      grantedBy: OWNER,
      groups: ['expenses', 'legacy'],
    })
    const response = await invokeApiRoute({
      handler: getGrants,
      env: accessEnv(store),
      url: 'https://expenses.test/api/access/grants',
      email: GUEST,
    })
    expect(await readJson(response)).toEqual({
      groups: { expenses: true, finance: false, legacy: true },
    })
  })

  it('lists the access group registry on GET /api/access/groups', async () => {
    const store = createInMemoryAccessDb()
    const response = await invokeApiRoute({
      handler: getGroups,
      env: accessEnv(store),
      url: 'https://expenses.test/api/access/groups',
      email: GUEST,
    })
    const body = await readJson<{ groups: Array<{ id: string; label: string }> }>(response)
    expect(body.groups.map((group) => group.id)).toEqual(['expenses', 'finance', 'legacy'])
  })

  it('approves a pending request with expenses group only', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER)
    store.seedPendingRequest('req-1', 'new@example.com')
    const approve = await invokeApiRoute({
      handler: approveRequest,
      env: accessEnv(store),
      url: 'https://expenses.test/api/access/admin/approve',
      method: 'POST',
      body: { requestId: 'req-1' },
      email: OWNER,
    })
    expect(approve.status).toBe(200)

    const status = await invokeApiRoute({
      handler: getStatus,
      env: accessEnv(store),
      url: 'https://expenses.test/api/access/status',
      email: 'new@example.com',
    })
    expect(await readJson(status)).toMatchObject({
      status: 'allowed',
      groups: { expenses: true, finance: false, legacy: false },
    })
  })

  it('lets the owner patch group grants and purges expense data when expenses is removed', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER)
    store.seedActiveUser(GUEST, { grantedBy: OWNER, groups: ['expenses', 'finance'] })

    const enableLegacy = await invokeApiRoute({
      handler: patchUserGrants,
      env: accessEnv(store),
      url: `https://expenses.test/api/access/admin/users/${encodeURIComponent(GUEST)}/grants`,
      method: 'PATCH',
      params: { email: GUEST },
      body: { groups: { legacy: true } },
      email: OWNER,
    })
    expect(await readJson(enableLegacy)).toEqual({
      email: GUEST,
      groups: { expenses: true, finance: true, legacy: true },
    })

    const removeExpenses = await invokeApiRoute({
      handler: patchUserGrants,
      env: accessEnv(store),
      url: `https://expenses.test/api/access/admin/users/${encodeURIComponent(GUEST)}/grants`,
      method: 'PATCH',
      params: { email: GUEST },
      body: { groups: { expenses: false } },
      email: OWNER,
    })
    expect(await readJson(removeExpenses)).toEqual({
      email: GUEST,
      groups: { expenses: false, finance: true, legacy: true },
    })
    expect(store.purgedOwners).toEqual([GUEST])
  })

  it('rejects non-owner grant updates with 403', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(OWNER)
    store.seedActiveUser(GUEST, { grantedBy: OWNER, groups: ['expenses'] })
    const response = await invokeApiRoute({
      handler: patchUserGrants,
      env: accessEnv(store),
      url: `https://expenses.test/api/access/admin/users/${encodeURIComponent(GUEST)}/grants`,
      method: 'PATCH',
      params: { email: GUEST },
      body: { groups: { finance: true } },
      email: GUEST,
    })
    expect(response.status).toBe(403)
  })

  it('blocks expense routes when the guest lacks the expenses group', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(GUEST, { grantedBy: OWNER, groups: ['finance'] })
    const response = await invokeApiRoute({
      handler: middlewareProbeHandler,
      env: accessEnv(store),
      url: 'https://expenses.test/api/expenses',
      email: GUEST,
    })
    expect(response.status).toBe(403)
    expect(await readJson(response)).toEqual({ error: 'Expense tracker access not granted' })
  })

  it('allows expense routes when the guest has the expenses group', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(GUEST, { grantedBy: OWNER, groups: ['expenses'] })
    const response = await invokeApiRoute({
      handler: middlewareProbeHandler,
      env: accessEnv(store),
      url: 'https://expenses.test/api/expenses',
      email: GUEST,
    })
    expect(response.status).toBe(200)
    expect(await readJson(response)).toEqual({ ok: true })
  })

  it('still allows access routes for guests without the expenses group', async () => {
    const store = createInMemoryAccessDb()
    store.seedActiveUser(GUEST, { grantedBy: OWNER, groups: ['finance'] })
    const response = await invokeApiRoute({
      handler: getGrants,
      env: accessEnv(store),
      url: 'https://expenses.test/api/access/grants',
      email: GUEST,
    })
    expect(response.status).toBe(200)
    expect(await readJson(response)).toEqual({
      groups: { expenses: false, finance: true, legacy: false },
    })
  })
})
