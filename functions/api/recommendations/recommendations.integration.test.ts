// @vitest-environment node
/**
 * The recommendation routes through the real middleware and migrations: a person sees and decides their own
 * recommendations only, submitting creates the expense once, and a made-up id or cursor never reaches SQL.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { OTHER, OWNER, createExpenseWorld, type Handler, type World } from '../../_shared/testing/expenseWorld'
import { invokeExpenseApiRoute } from '../../_shared/testing/invokeExpenseApiRoute'
import { createD1ExpenseRepository } from '../../_shared/adapters/d1ExpenseRepository'
import { createD1CaptureRepository } from '../../_shared/adapters/d1CaptureRepository'
import type { NewRecommendation } from '../../../src/domain/ports/captureRepository'
import { onRequestPost as postAccount } from '../expenses/accounts/index'
import { onRequestPost as postCategory } from '../expenses/categories/index'
import { onRequestPost as postTransaction } from '../expenses/transactions/index'
import { onRequestGet as list } from './index'
import { onRequestPost as submit } from './[id]/submit'
import { onRequestPost as dismiss } from './[id]/dismiss'
import { onRequestPost as link } from './[id]/link'

const BASE = 'https://expenses.test/api/recommendations'
const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

let world: World
let sqlite: ReturnType<typeof migratedDatabase>
let accountId: number
let categoryId: number

beforeEach(async () => {
  sqlite = migratedDatabase()
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const seeded = async (handler: Handler, path: string, body: unknown) =>
    ((await (await world.call(handler, { method: 'POST', path, body })).json()) as { id: number }).id
  accountId = await seeded(postAccount, '/accounts', { name: 'Debit', kind: 'debit', settlement: 'immediate', active: true })
  categoryId = await seeded(postCategory, '/categories', { name: 'Food', monthlyBudgetCents: 50_000, sortOrder: 0, active: true })
})

function call(
  handler: Handler,
  o: { n?: number; id?: string; query?: string; body?: unknown; email?: string; empty?: boolean } = {},
) {
  const id = o.id ?? (o.n === undefined ? undefined : idOf(o.n))
  const post = handler !== list
  const action = new Map<Handler, string>([[submit, '/submit'], [dismiss, '/dismiss'], [link, '/link']]).get(handler) ?? ''
  return invokeExpenseApiRoute({
    handler,
    repo: createD1ExpenseRepository(world.env),
    env: world.env,
    url: `${BASE}${id ? `/${id}${action}` : ''}${o.query ?? ''}`,
    method: post ? 'POST' : 'GET',
    email: o.email ?? OWNER,
    ...(id ? { params: { id } } : {}),
    ...(post && !o.empty ? { body: o.body ?? {} } : {}),
  })
}

async function seed(n: number, over: Partial<NewRecommendation> = {}, owner = OWNER) {
  await createD1CaptureRepository(world.env).createRecommendation({
    id: idOf(n),
    owner,
    accountId,
    amountCents: 1250,
    currency: 'EUR',
    occurredAt: '2026-03-02T08:59:00.000Z',
    localDate: '2026-03-02',
    merchantRaw: 'CAFE EXAMPLE',
    descriptionSuggested: null,
    suggestedType: 'expense',
    createdAt: '2026-03-02T09:00:00.000Z',
    ...over,
  })
}

const expense = () => ({
  date: '2026-03-02',
  budgetMonth: '2026-03',
  description: 'Coffee',
  accountId,
  categoryId,
  type: 'expense',
  amountCents: 1300,
  cancelled: false,
})
const state = (n: number) =>
  (sqlite.prepare('SELECT state, txn_id FROM recommendations WHERE id = ?').get(idOf(n)) as { state: string; txn_id: number | null })
const transactions = () => (sqlite.prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number }).n

describe('GET /api/recommendations', () => {
  it('lists the signed-in person open ones with the open count, and no one else', async () => {
    await seed(1)
    await seed(2, {}, OTHER)
    const body = (await (await call(list)).json()) as { recommendations: Array<{ id: string }>; next: null; openCount: number }
    expect(body.recommendations.map((r) => r.id)).toEqual([idOf(1)])
    expect(body).toMatchObject({ next: null, openCount: 1 })
  })

  it('pages with a cursor and has no next after the last page', async () => {
    for (const n of [1, 2, 3]) await seed(n, { localDate: `2026-03-0${n}` })
    const first = (await (await call(list, { query: '?limit=2' })).json()) as { recommendations: Array<{ id: string }>; next: string }
    expect(first.recommendations.map((r) => r.id)).toEqual([idOf(3), idOf(2)])
    const second = (await (await call(list, { query: `?limit=2&after=${first.next}` })).json()) as {
      recommendations: Array<{ id: string }>
      next: null
      openCount: number
    }
    expect(second.recommendations.map((r) => r.id)).toEqual([idOf(1)])
    expect(second).toMatchObject({ next: null, openCount: 3 })
  })

  it.each(['?limit=0', '?limit=101', '?limit=x', '?limit=1e1', '?limit=+5', '?limit=%205', '?after=nope', "?after=2026-03-02~'; DROP TABLE recommendations"])(
    'refuses %s with a 400',
    async (query) => {
      expect((await call(list, { query })).status).toBe(400)
    },
  )
})

describe('GET /api/recommendations, the typed row a payment may duplicate', () => {
  type Listed = { recommendations: Array<{ id: string; possibleMatch: { transactionId: number; description: string; date: string } | null }> }
  const listed = async (email = OWNER) => ((await (await call(list, { email })).json()) as Listed).recommendations
  const typedRow = async (over: Record<string, unknown> = {}) =>
    ((await (await world.call(postTransaction, { method: 'POST', path: '/transactions', body: { ...expense(), amountCents: 1250, ...over } })).json()) as { id: number }).id

  it('names the row the person typed for the same price on the same day, as transactionId, description and date', async () => {
    await seed(1)
    const id = await typedRow({ description: 'Coffee at the till' })

    expect((await listed())[0]?.possibleMatch).toEqual({ transactionId: id, description: 'Coffee at the till', date: '2026-03-02' })
  })

  it('is null on every payment when there is nothing like it, and the key is always there', async () => {
    await seed(1)
    await typedRow({ amountCents: 1251 })

    const [first] = await listed()
    expect(first).toHaveProperty('possibleMatch', null)
  })

  it("never uses another person's row, and never shows one person's description to another", async () => {
    await seed(1)
    await seed(2, {}, OTHER)
    sqlite
      .prepare("INSERT INTO transactions (date, budget_month, description, account_id, category_id, type, amount_cents, owner) VALUES ('2026-03-02', '2026-03', 'Their private coffee', ?, ?, 'expense', 1250, ?)")
      .run(accountId, categoryId, OTHER)

    expect((await listed())[0]?.possibleMatch).toBeNull()
    expect(JSON.stringify(await listed())).not.toContain('Their private coffee')
    expect((await listed(OTHER))[0]?.possibleMatch?.description).toBe('Their private coffee')
  })

  it('skips a row an earlier recommendation made or was linked to, so a captured and added payment does not match the next push', async () => {
    await seed(1)
    expect((await call(submit, { n: 1, body: { ...expense(), amountCents: 1250 } })).status).toBe(201)
    await seed(2)

    expect((await listed())[0]?.possibleMatch).toBeNull()
  })

  it('does not block anything: the payment can still be submitted whatever it matches', async () => {
    await seed(1)
    await typedRow()

    expect((await call(submit, { n: 1, body: { ...expense(), amountCents: 1250 } })).status).toBe(201)
  })
})

describe('POST /api/recommendations/:id/submit', () => {
  it('creates the expense from what the person sent and marks the recommendation submitted', async () => {
    await seed(1)
    const response = await call(submit, { n: 1, body: expense() })
    const created = (await response.json()) as { id: number; amountCents: number }
    expect(response.status).toBe(201)
    expect(created.amountCents).toBe(1300)
    expect(state(1)).toEqual({ state: 'submitted', txn_id: created.id })
    expect(transactions()).toBe(1)
  })

  it('creates nothing the second time, whatever the body', async () => {
    await seed(1)
    await call(submit, { n: 1, body: expense() })
    const again = await call(submit, { n: 1, body: expense() })
    expect(again.status).toBe(409)
    expect(transactions()).toBe(1)
  })

  it('removes the row it just created when a second tap decided it in between', async () => {
    await seed(1)
    world.intercept((sql) => {
      if (sql.startsWith('UPDATE recommendations')) {
        sqlite.prepare("UPDATE recommendations SET state = 'dismissed' WHERE id = ?").run(idOf(1))
      }
    })
    const response = await call(submit, { n: 1, body: expense() })
    expect(response.status).toBe(409)
    expect(transactions()).toBe(0)
  })

  it('removes the row it created and fails when marking the recommendation throws, so a retry makes one', async () => {
    await seed(1)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    world.intercept((sql) => {
      if (sql.startsWith('UPDATE recommendations')) throw new Error('D1 is down')
    })
    expect((await call(submit, { n: 1, body: expense() })).status).toBe(500)
    expect(transactions()).toBe(0)
    world.intercept(() => undefined)
    expect((await call(submit, { n: 1, body: expense() })).status).toBe(201)
    expect(transactions()).toBe(1)
  })

  it('still fails with the original error when removing the row also fails', async () => {
    await seed(1)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    world.intercept((sql) => {
      if (sql.startsWith('UPDATE recommendations')) throw new Error('D1 is down')
      if (sql.startsWith('DELETE FROM transactions')) throw new Error('delete failed')
    })
    expect((await call(submit, { n: 1, body: expense() })).status).toBe(500)
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('could not remove'), expect.any(Error))
    expect(state(1).state).toBe('open')
  })

  it('refuses an invalid expense without deciding the recommendation', async () => {
    await seed(1)
    const response = await call(submit, { n: 1, body: { ...expense(), amountCents: 'lots' } })
    expect(response.status).toBe(400)
    expect(state(1).state).toBe('open')
  })

  it("answers 404 for another person's recommendation and for an id that is not one", async () => {
    await seed(1, {}, OTHER)
    expect((await call(submit, { n: 1, body: expense() })).status).toBe(404)
    expect((await call(submit, { id: 'not-an-id', body: expense() })).status).toBe(404)
    expect(transactions()).toBe(0)
    expect(state(1).state).toBe('open')
  })
})

describe('the dataset revision', () => {
  it('moves for a submit and stays put for the list, a dismiss and a link', async () => {
    await seed(1)
    await seed(2)
    await seed(3)
    const typedId = ((await (await world.call(postTransaction, { method: 'POST', path: '/transactions', body: expense() })).json()) as { id: number }).id
    const before = world.token()
    await call(list)
    await call(dismiss, { n: 1, empty: true })
    await call(link, { n: 2, body: { transactionId: typedId } })
    expect(world.token()).toBe(before)
    await call(submit, { n: 3, body: expense() })
    expect(world.token()).not.toBe(before)
  })
})

describe('POST /api/recommendations/:id/dismiss', () => {
  it('takes it off the list and creates nothing', async () => {
    await seed(1)
    expect((await call(dismiss, { n: 1, empty: true })).status).toBe(200)
    expect(state(1)).toEqual({ state: 'dismissed', txn_id: null })
    expect(transactions()).toBe(0)
    expect((await call(dismiss, { n: 1 })).status).toBe(409)
  })

  it("is a 404 for another person's", async () => {
    await seed(1, {}, OTHER)
    expect((await call(dismiss, { n: 1 })).status).toBe(404)
    expect(state(1).state).toBe('open')
  })
})

describe('POST /api/recommendations/:id/link', () => {
  async function typed(): Promise<number> {
    const response = await world.call(postTransaction, { method: 'POST', path: '/transactions', body: expense() })
    return ((await response.json()) as { id: number }).id
  }

  it('marks it as answered by a row the person typed', async () => {
    await seed(1)
    const id = await typed()
    expect((await call(link, { n: 1, body: { transactionId: id } })).status).toBe(200)
    expect(state(1)).toEqual({ state: 'submitted', txn_id: id })
    expect(transactions()).toBe(1)
  })

  it("refuses another person's transaction with a 404 and leaves the recommendation open", async () => {
    await seed(1)
    const theirs = async (handler: Handler, path: string, body: unknown) =>
      ((await (await world.call(handler, { method: 'POST', path, body, email: OTHER })).json()) as { id: number }).id
    const account = await theirs(postAccount, '/accounts', { name: 'Debit', kind: 'debit', settlement: 'immediate', active: true })
    const category = await theirs(postCategory, '/categories', { name: 'Food', monthlyBudgetCents: 50_000, sortOrder: 0, active: true })
    const foreign = await world.call(postTransaction, {
      method: 'POST',
      path: '/transactions',
      body: { ...expense(), accountId: account, categoryId: category },
      email: OTHER,
    })
    const id = ((await foreign.json()) as { id: number }).id
    expect((await call(link, { n: 1, body: { transactionId: id } })).status).toBe(404)
    expect(state(1)).toEqual({ state: 'open', txn_id: null })
  })

  it("is a 404 for another person's recommendation and a 409 for one already decided", async () => {
    await seed(1, {}, OTHER)
    await seed(2)
    const id = await typed()
    expect((await call(link, { n: 1, body: { transactionId: id } })).status).toBe(404)
    await call(dismiss, { n: 2, empty: true })
    expect((await call(link, { n: 2, body: { transactionId: id } })).status).toBe(409)
    expect(state(1).state).toBe('open')
  })

  it('refuses a row that is not there, one that another recommendation answers for, and a bad id', async () => {
    await seed(1)
    await seed(2)
    const id = await typed()
    expect((await call(link, { n: 1, body: { transactionId: 9999 } })).status).toBe(404)
    await call(link, { n: 1, body: { transactionId: id } })
    expect((await call(link, { n: 2, body: { transactionId: id } })).status).toBe(409)
    expect((await call(link, { n: 2, body: { transactionId: 'x' } })).status).toBe(400)
    expect((await call(link, { n: 2, body: [] })).status).toBe(400)
    expect(state(2).state).toBe('open')
  })
})
