/**
 * A withdrawal is an investment with a negative amount. These run the real routes, the
 * real middleware and the real transactionService against the in-memory repository,
 * which mirrors the D1 adapter's row-aware checks; the adapter's own SQL path is covered
 * in functions/_shared/dbWrite.test.ts.
 */
import { describe, expect, it } from 'vitest'
import type { Env } from '../../../_shared/env'
import { createInMemoryAccessDb } from '../../../_shared/testing/inMemoryAccessDb'
import { invokeExpenseApiRoute } from '../../../_shared/testing/invokeExpenseApiRoute'
import { inMemoryExpenseRepository } from '../../../../src/testing/inMemoryExpenseRepository'
import type { ExpenseRepository } from '../../../../src/domain/ports/expenseRepository'
import { AMOUNT_SIGN_MESSAGE } from '../../../../src/domain/data/amountSign'
import { onRequestPost as createTransaction } from './index'
import { onRequestPatch as patchTransaction } from './[id]'
import { onRequestPost as bulkCreate, onRequestPatch as bulkPatch } from './bulk'

const OWNER = 'owner@example.com'
const BASE = 'https://expenses.test/api/expenses/transactions'

function setup() {
  const store = createInMemoryAccessDb()
  store.seedActiveUser(OWNER, { groups: ['expenses'] })
  const env: Env = { DB: store.db, OWNER_EMAIL: OWNER }
  const repo = inMemoryExpenseRepository(
    {
      accounts: [{ id: 1, name: 'Main', kind: 'debit', settlement: 'immediate', active: true }],
      categories: [{ id: 1, name: 'Investing', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
    },
    OWNER,
  )
  return { env, repo }
}

function row(type: string, amountCents: number) {
  return {
    date: '2026-09-10',
    budgetMonth: '2026-09',
    description: 'Broker',
    accountId: 1,
    categoryId: 1,
    type,
    amountCents,
    cancelled: false,
  }
}

async function create(env: Env, repo: ExpenseRepository, type: string, amountCents: number) {
  return invokeExpenseApiRoute({
    handler: createTransaction,
    repo,
    env,
    url: BASE,
    method: 'POST',
    body: row(type, amountCents),
    email: OWNER,
  })
}

async function created(env: Env, repo: ExpenseRepository, type: string, amountCents: number) {
  const response = await create(env, repo, type, amountCents)
  expect(response.status).toBe(201)
  return (await response.json()) as { id: number; type: string; amountCents: number }
}

async function patch(env: Env, repo: ExpenseRepository, id: number, body: unknown) {
  return invokeExpenseApiRoute({
    handler: patchTransaction,
    repo,
    env,
    url: `${BASE}/${id}`,
    method: 'PATCH',
    params: { id: String(id) },
    body,
    email: OWNER,
  })
}

async function message(response: Response): Promise<string> {
  const body = (await response.json()) as { error?: string; message?: string }
  return body.error ?? body.message ?? ''
}

describe('POST /transactions', () => {
  it('accepts a negative amount on an investment and keeps its sign', async () => {
    const { env, repo } = setup()
    const txn = await created(env, repo, 'investment', -19_840)
    expect(txn.type).toBe('investment')
    expect(txn.amountCents).toBe(-19_840)
    const stored = await repo.loadDataset(OWNER)
    expect(stored.transactions[0]?.amountCents).toBe(-19_840)
  })

  it('refuses a negative amount on anything else, and zero on everything', async () => {
    const { env, repo } = setup()
    const expense = await create(env, repo, 'expense', -500)
    expect(expense.status).toBe(400)
    expect(await message(expense)).toContain(AMOUNT_SIGN_MESSAGE)
    const zero = await create(env, repo, 'investment', 0)
    expect(zero.status).toBe(400)
  })
})

describe('POST /transactions/bulk (the import path)', () => {
  it('accepts a withdrawal row and refuses a negative expense in the same batch', async () => {
    const { env, repo } = setup()
    const ok = await invokeExpenseApiRoute({
      handler: bulkCreate,
      repo,
      env,
      url: `${BASE}/bulk`,
      method: 'POST',
      body: { transactions: [row('investment', 50_000), row('investment', -20_000)] },
      email: OWNER,
    })
    expect(ok.status).toBe(201)
    const bad = await invokeExpenseApiRoute({
      handler: bulkCreate,
      repo,
      env,
      url: `${BASE}/bulk`,
      method: 'POST',
      body: { transactions: [row('investment', 50_000), row('expense', -20_000)] },
      email: OWNER,
    })
    expect(bad.status).toBe(400)
    // Nothing from the refused batch landed.
    expect((await repo.loadDataset(OWNER)).transactions).toHaveLength(2)
  })
})

describe('PATCH /transactions/:id', () => {
  it('turns an expense into a withdrawal when amount and type arrive together', async () => {
    const { env, repo } = setup()
    const txn = await created(env, repo, 'expense', 500)
    const response = await patch(env, repo, txn.id, { amountCents: -500, type: 'investment' })
    expect(response.status).toBe(200)
  })

  it('refuses a negative amount alone on a row that is not an investment', async () => {
    const { env, repo } = setup()
    const txn = await created(env, repo, 'expense', 500)
    const response = await patch(env, repo, txn.id, { amountCents: -500 })
    expect(response.status).toBe(400)
    expect(await message(response)).toContain(AMOUNT_SIGN_MESSAGE)
  })

  it('refuses a type change away from investment on a withdrawal, and allows it on a deposit', async () => {
    const { env, repo } = setup()
    const withdrawal = await created(env, repo, 'investment', -500)
    const deposit = await created(env, repo, 'investment', 500)
    expect((await patch(env, repo, withdrawal.id, { type: 'expense' })).status).toBe(400)
    expect((await patch(env, repo, deposit.id, { type: 'expense' })).status).toBe(200)
  })
})

describe('PATCH /transactions/bulk', () => {
  it('refuses a type change away from investment when any row is a withdrawal, touching none', async () => {
    const { env, repo } = setup()
    const withdrawal = await created(env, repo, 'investment', -500)
    const deposit = await created(env, repo, 'investment', 500)
    const response = await invokeExpenseApiRoute({
      handler: bulkPatch,
      repo,
      env,
      url: `${BASE}/bulk`,
      method: 'PATCH',
      body: { ids: [withdrawal.id, deposit.id], patch: { type: 'expense' } },
      email: OWNER,
    })
    expect(response.status).toBe(400)
    expect(await message(response)).toContain(AMOUNT_SIGN_MESSAGE)
    const stored = await repo.loadDataset(OWNER)
    expect(stored.transactions.map((t) => t.type)).toEqual(['investment', 'investment'])

    const allDeposits = await invokeExpenseApiRoute({
      handler: bulkPatch,
      repo,
      env,
      url: `${BASE}/bulk`,
      method: 'PATCH',
      body: { ids: [deposit.id], patch: { type: 'expense' } },
      email: OWNER,
    })
    expect(allDeposits.status).toBe(200)
  })
})
