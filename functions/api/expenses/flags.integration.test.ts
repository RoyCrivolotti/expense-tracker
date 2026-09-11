import { describe, expect, it } from 'vitest'
import type { Flag, Transaction } from '../../../src/domain/types'
import type { Env } from '../../_shared/env'
import { createInMemoryAccessDb } from '../../_shared/testing/inMemoryAccessDb'
import { invokeExpenseApiRoute } from '../../_shared/testing/invokeExpenseApiRoute'
import { inMemoryExpenseRepository } from '../../../src/testing/inMemoryExpenseRepository'
import { onRequestPost as createFlag } from './flags/index'
import { onRequestPatch as patchFlag, onRequestDelete as deleteFlag } from './flags/[id]'
import { onRequestPatch as bulkFlag } from './transactions/bulk'
import { onRequestPatch as patchTransaction } from './transactions/[id]'

const OWNER = 'owner@example.com'
const BASE = 'https://expenses.test/api/expenses'

function ownerEnv(store: ReturnType<typeof createInMemoryAccessDb>): Env {
  return { DB: store.db, OWNER_EMAIL: OWNER }
}

function seeded() {
  const store = createInMemoryAccessDb()
  store.seedActiveUser(OWNER, { grantedBy: OWNER, groups: ['expenses'] })
  const repo = inMemoryExpenseRepository(
    {
      categories: [{ id: 1, name: 'Travel', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
      accounts: [{ id: 1, name: 'Debit', kind: 'debit', settlement: 'immediate', active: true }],
      transactions: [
        {
          id: 1,
          date: '2026-05-01',
          budgetMonth: '2026-05',
          description: 'Hotel',
          accountId: 1,
          categoryId: 1,
          type: 'expense',
          amountCents: 12_000,
          cancelled: false,
          status: 'posted',
        },
        {
          id: 2,
          date: '2026-05-02',
          budgetMonth: '2026-05',
          description: 'Taxi',
          accountId: 1,
          categoryId: 1,
          type: 'expense',
          amountCents: 3_000,
          cancelled: false,
          status: 'posted',
        },
      ],
    },
    OWNER,
  )
  return { store, repo }
}

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

async function makeFlag(
  store: ReturnType<typeof createInMemoryAccessDb>,
  repo: ReturnType<typeof inMemoryExpenseRepository>,
  overrides: Record<string, unknown> = {},
): Promise<Flag> {
  const response = await invokeExpenseApiRoute({
    handler: createFlag,
    repo,
    env: ownerEnv(store),
    url: `${BASE}/flags`,
    method: 'POST',
    body: { name: 'Work travel', color: '#6366F1', sortOrder: 0, active: true, ...overrides },
  })
  expect(response.status).toBe(201)
  return body<Flag>(response)
}

describe('flags API (middleware + handlers + in-memory repo)', () => {
  it('creates a flag, normalising the colour to lowercase hex', async () => {
    const { store, repo } = seeded()
    const flag = await makeFlag(store, repo)

    expect(flag).toMatchObject({ id: 1, name: 'Work travel', color: '#6366f1', active: true })
  })

  it('rejects a flag with no name', async () => {
    const { store, repo } = seeded()
    const response = await invokeExpenseApiRoute({
      handler: createFlag,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/flags`,
      method: 'POST',
      body: { name: '   ', color: '#6366f1', sortOrder: 0, active: true },
    })

    expect(response.status).toBe(400)
    expect(await body<{ error: string }>(response)).toEqual({ error: 'Flag name is required' })
  })

  it('rejects a colour that is not a hex value', async () => {
    const { store, repo } = seeded()
    const response = await invokeExpenseApiRoute({
      handler: createFlag,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/flags`,
      method: 'POST',
      body: { name: 'Work travel', color: 'rebeccapurple', sortOrder: 0, active: true },
    })

    expect(response.status).toBe(400)
    expect((await body<{ error: string }>(response)).error).toMatch(/hex value/)
  })

  it('drops a blank description rather than storing an empty string', async () => {
    const { store, repo } = seeded()
    const flag = await makeFlag(store, repo, { description: '   ' })

    expect(flag.description).toBeUndefined()
  })

  it('patches a flag', async () => {
    const { store, repo } = seeded()
    const flag = await makeFlag(store, repo)
    const response = await invokeExpenseApiRoute({
      handler: patchFlag,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/flags/${flag.id}`,
      method: 'PATCH',
      params: { id: String(flag.id) },
      body: { name: 'Client travel', description: 'Reimbursable — submit monthly' },
    })

    expect(response.status).toBe(200)
    expect(await body<Flag>(response)).toMatchObject({
      name: 'Client travel',
      description: 'Reimbursable — submit monthly',
    })
  })

  it('rejects an over-long description', async () => {
    const { store, repo } = seeded()
    const response = await invokeExpenseApiRoute({
      handler: createFlag,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/flags`,
      method: 'POST',
      body: { name: 'Work', color: '#6366f1', sortOrder: 0, active: true, description: 'x'.repeat(141) },
    })

    expect(response.status).toBe(400)
    expect((await body<{ error: string }>(response)).error).toMatch(/140 characters or fewer/)
  })

  it('surfaces a patch failure as a 400, not a 500', async () => {
    const { store, repo } = seeded()
    const flag = await makeFlag(store, repo)
    const response = await invokeExpenseApiRoute({
      handler: patchFlag,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/flags/${flag.id}`,
      method: 'PATCH',
      params: { id: String(flag.id) },
      body: { color: 'not-a-colour' },
    })

    expect(response.status).toBe(400)
  })

  it('rejects a bulk flagId that is not a positive integer or null', async () => {
    const { store, repo } = seeded()
    const response = await invokeExpenseApiRoute({
      handler: bulkFlag,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/transactions/bulk`,
      method: 'PATCH',
      body: { ids: [1], flagId: 0 },
    })

    expect(response.status).toBe(400)
    expect((await body<{ error: string }>(response)).error).toMatch(/positive integer or null/)
  })

  it('rejects bulk ids that are not positive integers', async () => {
    const { store, repo } = seeded()
    const response = await invokeExpenseApiRoute({
      handler: bulkFlag,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/transactions/bulk`,
      method: 'PATCH',
      body: { ids: [1, -2], flagId: null },
    })

    expect(response.status).toBe(400)
    expect((await body<{ error: string }>(response)).error).toMatch(/positive integers/)
  })

  it('applies a flag through the transaction PATCH, not just silently accepting it', async () => {
    // The COLUMN allowlist in dbWrite is easy to forget; a missing entry returns
    // 200 with the flag unchanged, so assert the returned row, not the status.
    const { store, repo } = seeded()
    const flag = await makeFlag(store, repo)
    const response = await invokeExpenseApiRoute({
      handler: patchTransaction,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/transactions/1`,
      method: 'PATCH',
      params: { id: '1' },
      body: { flagId: flag.id },
    })

    expect(await body<Transaction>(response)).toMatchObject({ id: 1, flagId: flag.id })
  })

  it('clears a flag when the patch sends null', async () => {
    const { store, repo } = seeded()
    const flag = await makeFlag(store, repo)
    await repo.setTransactionsFlag(OWNER, [1], flag.id)
    const response = await invokeExpenseApiRoute({
      handler: patchTransaction,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/transactions/1`,
      method: 'PATCH',
      params: { id: '1' },
      body: { flagId: null },
    })

    expect(await body<Transaction>(response)).not.toHaveProperty('flagId')
  })

  it('rejects a flagId that belongs to nobody', async () => {
    const { store, repo } = seeded()
    const response = await invokeExpenseApiRoute({
      handler: patchTransaction,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/transactions/1`,
      method: 'PATCH',
      params: { id: '1' },
      body: { flagId: 999 },
    })

    expect(response.status).toBe(400)
    expect(await body<{ error: string }>(response)).toEqual({ error: 'Invalid flagId' })
  })

  it('flags many transactions in one bulk call', async () => {
    const { store, repo } = seeded()
    const flag = await makeFlag(store, repo)
    const response = await invokeExpenseApiRoute({
      handler: bulkFlag,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/transactions/bulk`,
      method: 'PATCH',
      body: { ids: [1, 2], flagId: flag.id },
    })

    expect(response.status).toBe(200)
    const rows = await body<Transaction[]>(response)
    expect(rows.map((t) => t.flagId)).toEqual([flag.id, flag.id])
  })

  it('rejects a bulk call with no ids', async () => {
    const { store, repo } = seeded()
    const response = await invokeExpenseApiRoute({
      handler: bulkFlag,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/transactions/bulk`,
      method: 'PATCH',
      body: { ids: [], flagId: null },
    })

    expect(response.status).toBe(400)
    expect((await body<{ error: string }>(response)).error).toMatch(/non-empty array/)
  })

  it('deleting a flag clears it from its transactions instead of orphaning them', async () => {
    const { store, repo } = seeded()
    const flag = await makeFlag(store, repo)
    await repo.setTransactionsFlag(OWNER, [1, 2], flag.id)

    const response = await invokeExpenseApiRoute({
      handler: deleteFlag,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/flags/${flag.id}`,
      method: 'DELETE',
      params: { id: String(flag.id) },
    })

    expect(await body<{ unflagged: number }>(response)).toEqual({ unflagged: 2 })
    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.flags).toEqual([])
    expect(dataset.transactions.every((t) => t.flagId === undefined)).toBe(true)
  })

  it('404s when deleting a flag that is not yours', async () => {
    const { store, repo } = seeded()
    const response = await invokeExpenseApiRoute({
      handler: deleteFlag,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/flags/999`,
      method: 'DELETE',
      params: { id: '999' },
    })

    expect(response.status).toBe(400)
  })

  it('401s without the Cloudflare Access header', async () => {
    const { store, repo } = seeded()
    const response = await invokeExpenseApiRoute({
      handler: createFlag,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/flags`,
      method: 'POST',
      email: false,
      body: { name: 'Work travel', color: '#6366f1', sortOrder: 0, active: true },
    })

    expect(response.status).toBe(401)
  })
})
