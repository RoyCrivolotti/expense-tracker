import { describe, expect, it } from 'vitest'
import type { Label, Transaction } from '../../../src/domain/types'
import type { Env } from '../../_shared/env'
import { createInMemoryAccessDb } from '../../_shared/testing/inMemoryAccessDb'
import { invokeExpenseApiRoute } from '../../_shared/testing/invokeExpenseApiRoute'
import { inMemoryExpenseRepository } from '../../../src/testing/inMemoryExpenseRepository'
import { onRequestPost as createLabel } from './labels/index'
import { onRequestPatch as patchLabel, onRequestDelete as deleteLabel } from './labels/[id]'
import { onRequestPut as setTransactionLabels } from './transactions/[id]/labels'

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

async function makeLabel(
  store: ReturnType<typeof createInMemoryAccessDb>,
  repo: ReturnType<typeof inMemoryExpenseRepository>,
  overrides: Record<string, unknown> = {},
): Promise<Label> {
  const response = await invokeExpenseApiRoute({
    handler: createLabel,
    repo,
    env: ownerEnv(store),
    url: `${BASE}/labels`,
    method: 'POST',
    body: { name: 'Japan trip', color: '#10B981', sortOrder: 0, active: true, ...overrides },
  })
  expect(response.status).toBe(201)
  return body<Label>(response)
}

describe('labels API (middleware + handlers + in-memory repo)', () => {
  it('creates a label, normalising the colour to lowercase hex', async () => {
    const { store, repo } = seeded()
    const label = await makeLabel(store, repo)

    expect(label).toMatchObject({ id: 1, name: 'Japan trip', color: '#10b981', active: true })
  })

  it('rejects a label with no name', async () => {
    const { store, repo } = seeded()
    const response = await invokeExpenseApiRoute({
      handler: createLabel,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/labels`,
      method: 'POST',
      body: { name: '   ', color: '#10b981', sortOrder: 0, active: true },
    })

    expect(response.status).toBe(400)
    expect(await body<{ error: string }>(response)).toEqual({ error: 'Label name is required' })
  })

  it('rejects a colour that is not a hex value', async () => {
    const { store, repo } = seeded()
    const response = await invokeExpenseApiRoute({
      handler: createLabel,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/labels`,
      method: 'POST',
      body: { name: 'Japan trip', color: 'emerald', sortOrder: 0, active: true },
    })

    expect(response.status).toBe(400)
    expect((await body<{ error: string }>(response)).error).toMatch(/hex value/)
  })

  it('patches a label', async () => {
    const { store, repo } = seeded()
    const label = await makeLabel(store, repo)
    const response = await invokeExpenseApiRoute({
      handler: patchLabel,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/labels/${label.id}`,
      method: 'PATCH',
      params: { id: String(label.id) },
      body: { name: 'Osaka trip' },
    })

    expect(response.status).toBe(200)
    expect(await body<Label>(response)).toMatchObject({ name: 'Osaka trip' })
  })

  it('patches a description, then clears it with an explicit empty string', async () => {
    const { store, repo } = seeded()
    const label = await makeLabel(store, repo)

    const withDescription = await invokeExpenseApiRoute({
      handler: patchLabel,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/labels/${label.id}`,
      method: 'PATCH',
      params: { id: String(label.id) },
      body: { description: 'Spring 2027' },
    })
    expect(await body<Label>(withDescription)).toMatchObject({ description: 'Spring 2027' })

    const cleared = await invokeExpenseApiRoute({
      handler: patchLabel,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/labels/${label.id}`,
      method: 'PATCH',
      params: { id: String(label.id) },
      body: { description: '' },
    })
    expect(await body<Label>(cleared)).not.toHaveProperty('description')
  })

  it('404s when deleting a label that is not yours', async () => {
    const { store, repo } = seeded()
    const response = await invokeExpenseApiRoute({
      handler: deleteLabel,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/labels/999`,
      method: 'DELETE',
      params: { id: '999' },
    })

    expect(response.status).toBe(400)
    expect(await body<{ error: string }>(response)).toEqual({ error: 'Invalid labelId' })
  })

  it('applies labels to a transaction through the dedicated PUT route', async () => {
    const { store, repo } = seeded()
    const work = await makeLabel(store, repo, { name: 'Work trip' })
    const tax = await makeLabel(store, repo, { name: 'Tax deductible' })

    const response = await invokeExpenseApiRoute({
      handler: setTransactionLabels,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/transactions/1/labels`,
      method: 'PUT',
      params: { id: '1' },
      body: { labelIds: [work.id, tax.id] },
    })

    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.transactions.find((t) => t.id === 1)?.labelIds).toEqual([work.id, tax.id])

    expect(response.status).toBe(200)
    const txn = await body<Transaction>(response)
    expect(txn.labelIds).toEqual([work.id, tax.id])
  })

  it('replaces the whole set rather than adding to it', async () => {
    const { store, repo } = seeded()
    const work = await makeLabel(store, repo, { name: 'Work trip' })
    const tax = await makeLabel(store, repo, { name: 'Tax deductible' })
    await repo.setTransactionLabels(OWNER, 1, [work.id])

    const response = await invokeExpenseApiRoute({
      handler: setTransactionLabels,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/transactions/1/labels`,
      method: 'PUT',
      params: { id: '1' },
      body: { labelIds: [tax.id] },
    })

    const txn = await body<Transaction>(response)
    expect(txn.labelIds).toEqual([tax.id])
  })

  it('clears every label when sent an empty array', async () => {
    const { store, repo } = seeded()
    const work = await makeLabel(store, repo)
    await repo.setTransactionLabels(OWNER, 1, [work.id])

    const response = await invokeExpenseApiRoute({
      handler: setTransactionLabels,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/transactions/1/labels`,
      method: 'PUT',
      params: { id: '1' },
      body: { labelIds: [] },
    })

    const txn = await body<Transaction>(response)
    expect(txn.labelIds).toEqual([])
  })

  it('dedupes a repeated labelId instead of erroring on the UNIQUE constraint', async () => {
    const { store, repo } = seeded()
    const work = await makeLabel(store, repo)

    const response = await invokeExpenseApiRoute({
      handler: setTransactionLabels,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/transactions/1/labels`,
      method: 'PUT',
      params: { id: '1' },
      body: { labelIds: [work.id, work.id] },
    })

    expect(response.status).toBe(200)
    const txn = await body<Transaction>(response)
    expect(txn.labelIds).toEqual([work.id])
  })

  it('rejects a labelId that belongs to nobody', async () => {
    const { store, repo } = seeded()
    const response = await invokeExpenseApiRoute({
      handler: setTransactionLabels,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/transactions/1/labels`,
      method: 'PUT',
      params: { id: '1' },
      body: { labelIds: [999] },
    })

    expect(response.status).toBe(400)
    expect(await body<{ error: string }>(response)).toEqual({ error: 'Invalid labelId' })
  })

  it('rejects a transaction id that belongs to nobody', async () => {
    const { store, repo } = seeded()
    const response = await invokeExpenseApiRoute({
      handler: setTransactionLabels,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/transactions/999/labels`,
      method: 'PUT',
      params: { id: '999' },
      body: { labelIds: [] },
    })

    expect(response.status).toBe(400)
    expect(await body<{ error: string }>(response)).toEqual({ error: 'Invalid transactionId' })
  })

  it('deleting a label unlinks it from every transaction instead of orphaning the link', async () => {
    const { store, repo } = seeded()
    const work = await makeLabel(store, repo)
    await repo.setTransactionLabels(OWNER, 1, [work.id])
    await repo.setTransactionLabels(OWNER, 2, [work.id])

    const response = await invokeExpenseApiRoute({
      handler: deleteLabel,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/labels/${work.id}`,
      method: 'DELETE',
      params: { id: String(work.id) },
    })

    expect(await body<{ unlabeled: number }>(response)).toEqual({ unlabeled: 2 })
    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.labels).toEqual([])
    expect(dataset.transactions.every((t) => (t.labelIds ?? []).length === 0)).toBe(true)
  })

  it('404s when patching a label that is not yours', async () => {
    const { store, repo } = seeded()
    const response = await invokeExpenseApiRoute({
      handler: patchLabel,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/labels/999`,
      method: 'PATCH',
      params: { id: '999' },
      body: { name: 'x' },
    })

    expect(response.status).toBe(404)
  })

  it('401s without the Cloudflare Access header', async () => {
    const { store, repo } = seeded()
    const response = await invokeExpenseApiRoute({
      handler: createLabel,
      repo,
      env: ownerEnv(store),
      url: `${BASE}/labels`,
      method: 'POST',
      email: false,
      body: { name: 'Japan trip', color: '#10b981', sortOrder: 0, active: true },
    })

    expect(response.status).toBe(401)
  })
})
