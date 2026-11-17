// @vitest-environment node
/**
 * What an accept teaches about the merchant behind a push, end to end: pushes go through the capture Worker into the
 * same database the routes read, and each decision goes through the real middleware and route.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { OWNER, createExpenseWorld, type Handler, type World } from '../../_shared/testing/expenseWorld'
import { createD1CaptureRepository } from '../../_shared/adapters/d1CaptureRepository'
import { learnAfterDecision } from '../../../src/domain/application/recommendationService'
import { MAX_CAPTURE_MERCHANTS } from '../../../src/domain/capture'
import { capturePhone } from '../../_shared/testing/capturePhone'
import { onRequestPost as postAccount } from '../expenses/accounts/index'
import { onRequestPost as postCategory } from '../expenses/categories/index'
import { onRequestPost as postTransaction } from '../expenses/transactions/index'
import { onRequestPost as submit } from './[id]/submit'
import { onRequestPost as dismiss } from './[id]/dismiss'
import { onRequestPost as link } from './[id]/link'
import { onRequestGet as list } from './index'

const NOW = new Date('2026-11-03T08:45:00.000Z')
const PUSH = (merchant: string, amount = '33,40') => `Has pagado ${amount} EUR en ${merchant} con tu tarjeta *4321`

let world: World
let sqlite: ReturnType<typeof migratedDatabase>
let accountId: number
let categoryId: number
let push: (body: string) => Promise<string | null>

beforeEach(async () => {
  sqlite = migratedDatabase()
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  const seeded = async (handler: Handler, path: string, body: unknown) =>
    ((await (await world.call(handler, { method: 'POST', path, body })).json()) as { id: number }).id
  accountId = await seeded(postAccount, '/accounts', { name: 'Debit', kind: 'debit', settlement: 'immediate', active: true })
  categoryId = await seeded(postCategory, '/categories', { name: 'Food', monthlyBudgetCents: 50_000, sortOrder: 0, active: true })
  push = (await capturePhone(world.env.DB, OWNER, NOW)).push
})

function decide(handler: Handler, id: string, body: unknown = {}) {
  const action = handler === submit ? 'submit' : handler === link ? 'link' : 'dismiss'
  return world.call(handler, { method: 'POST', path: `/../recommendations/${id}/${action}`, params: { id }, body })
}

const row = (description: string, over: Record<string, unknown> = {}) => ({
  date: '2026-11-03',
  budgetMonth: '2026-11',
  description,
  accountId,
  categoryId,
  type: 'expense',
  amountCents: 3340,
  cancelled: false,
  ...over,
})

const merchants = () =>
  sqlite.prepare('SELECT key, amount_cents, description, category_id, type, account_id, votes FROM capture_merchants ORDER BY key, amount_cents, description').all()

/** A first push of the wording keeps its whole body; a second at another merchant shows where the merchant sits. */
async function learnTheWording(): Promise<void> {
  await decide(dismiss, (await push(PUSH('Alpha Shop')))!)
  await decide(dismiss, (await push(PUSH('Beta Store')))!)
}

describe('an accept', () => {
  it('learns nothing about the merchant from a push that kept its whole body', async () => {
    await decide(submit, (await push(PUSH('Example Cafe')))!, row('Coffee'))

    expect(merchants()).toEqual([])
  })

  it('votes for the description at any price and at the saved one, once the merchant is known', async () => {
    await learnTheWording()
    await decide(submit, (await push(PUSH('Example Cafe 0042')))!, row('  Coffee '))

    const vote = { key: 'example cafe', description: 'Coffee', category_id: categoryId, type: 'expense', account_id: accountId, votes: 1 }
    expect(merchants()).toEqual([
      { ...vote, amount_cents: -1 },
      { ...vote, amount_cents: 3340 },
    ])
  })

  it('counts a second accept of the same description, and keeps another description apart', async () => {
    await learnTheWording()
    await decide(submit, (await push(PUSH('Example Cafe')))!, row('Coffee'))
    await decide(submit, (await push(PUSH('Example Cafe')))!, row('Coffee'))
    await decide(submit, (await push(PUSH('Example Cafe', '5,00')))!, row('Breakfast', { amountCents: 500 }))

    expect(merchants()).toEqual([
      expect.objectContaining({ amount_cents: -1, description: 'Breakfast', votes: 1 }),
      expect.objectContaining({ amount_cents: -1, description: 'Coffee', votes: 2 }),
      expect.objectContaining({ amount_cents: 500, description: 'Breakfast', votes: 1 }),
      expect.objectContaining({ amount_cents: 3340, description: 'Coffee', votes: 2 }),
    ])
  })

  it('votes from a linked row too', async () => {
    await learnTheWording()
    const id = (await push(PUSH('Example Cafe')))!
    const typed = (await (await world.call(postTransaction, { method: 'POST', path: '/transactions', body: row('Coffee') })).json()) as { id: number }
    await decide(link, id, { transactionId: typed.id })

    expect(merchants()).toHaveLength(2)
  })

  it('votes once however often learning runs for one decision', async () => {
    await learnTheWording()
    const id = (await push(PUSH('Example Cafe')))!
    const rec = (await createD1CaptureRepository(world.env).getRecommendation(OWNER, id))!
    await decide(submit, id, row('Coffee'))
    const saved = { amountCents: 3340, type: 'expense', accountId, description: 'Coffee', categoryId }
    await learnAfterDecision(createD1CaptureRepository(world.env), OWNER, rec, { kind: 'submitted', saved }, NOW)

    expect(merchants()).toEqual([expect.objectContaining({ votes: 1 }), expect.objectContaining({ votes: 1 })])
  })
})

type Listed = { id: string; amountCents: number; suggestion: Record<string, unknown> | null }
async function suggestionOf(id: string) {
  const body = (await (await world.call(list, { method: 'GET', path: '/../recommendations' })).json()) as { recommendations: Listed[] }
  return body.recommendations.find((r) => r.id === id)?.suggestion
}

describe('the list', () => {
  it('suggests the description once it is settled by two adds, with its category, the type and the account', async () => {
    await learnTheWording()
    await decide(submit, (await push(PUSH('Example Cafe')))!, row('Coffee', { type: 'expense' }))
    const second = (await push(PUSH('Example Cafe')))!
    expect(await suggestionOf(second)).toMatchObject({ description: 'Coffee', sightings: 1, settled: false, reasons: [] })
    await decide(submit, second, row('Coffee'))

    const third = (await push(PUSH('Example Cafe 0099')))!
    expect(await suggestionOf(third)).toEqual({
      description: 'Coffee',
      categoryId,
      type: 'expense',
      // The card is not linked and the push showed its digits, so the template does not learn an account either.
      accountId: null,
      amountCents: 3340,
      sightings: 2,
      settled: true,
      reasons: [],
    })
  })

  it('suggests by the price when one merchant name stands for several', async () => {
    await learnTheWording()
    for (const [amount, cents, description] of [['2,99', 299, 'Music'], ['9,99', 999, 'Video'], ['9,99', 999, 'Video']] as const) {
      await decide(submit, (await push(PUSH('Example Store', amount)))!, row(description, { amountCents: cents }))
    }

    expect(await suggestionOf((await push(PUSH('Example Store', '2,99')))!)).toMatchObject({ description: 'Music', sightings: 1, settled: false })
    expect(await suggestionOf((await push(PUSH('Example Store', '9,99')))!)).toMatchObject({ description: 'Video', sightings: 2, settled: true })
    // A price never seen falls back to every price, where Video leads.
    expect(await suggestionOf((await push(PUSH('Example Store', '4,50')))!)).toMatchObject({ description: 'Video', sightings: 3, settled: true })
  })

  it('lets one add at a price give way to the merchant’s settled history, so one tap stays open', async () => {
    await learnTheWording()
    for (const amount of ['3,40', '4,10', '2,80']) {
      const cents = Number(amount.replace(',', ''))
      await decide(submit, (await push(PUSH('Example Cafe', amount)))!, row('Coffee', { amountCents: cents }))
    }

    expect(await suggestionOf((await push(PUSH('Example Cafe', '3,40')))!)).toMatchObject({ description: 'Coffee', sightings: 3, settled: true })
  })

  it('says a wording the person has never accepted is new', async () => {
    expect(await suggestionOf((await push(PUSH('Example Cafe')))!)).toMatchObject({ description: null, reasons: ['new-shape'] })
  })
})

describe('a dismissal', () => {
  it('teaches the merchant nothing', async () => {
    await learnTheWording()
    await decide(dismiss, (await push(PUSH('Example Cafe')))!)

    expect(merchants()).toEqual([])
  })
})

describe('the cap', () => {
  it('keeps the person at the cap by evicting the least recently seen rows, never the ones just voted', async () => {
    await learnTheWording()
    const insert = sqlite.prepare("INSERT INTO capture_merchants (owner, key, amount_cents, description, votes, last_seen) VALUES (?, ?, -1, 'Old', 1, ?)")
    for (let i = 0; i < MAX_CAPTURE_MERCHANTS; i++) insert.run(OWNER, `old ${String(i).padStart(4, '0')}`, `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}.000Z`)
    insert.run('someone-else@example.com', 'theirs', '2020-01-01T00:00:00.000Z')

    await decide(submit, (await push(PUSH('Example Cafe')))!, row('Coffee'))

    const count = (owner: string) => (sqlite.prepare('SELECT COUNT(*) AS n FROM capture_merchants WHERE owner = ?').get(owner) as { n: number }).n
    expect(count(OWNER)).toBe(MAX_CAPTURE_MERCHANTS)
    expect(count('someone-else@example.com')).toBe(1)
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM capture_merchants WHERE key = 'example cafe'").get()).toEqual({ n: 2 })
    // The two evicted were written at the earliest second, 00:00:00.
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM capture_merchants WHERE last_seen = '2026-01-01T00:00:00.000Z'").get()).toEqual({ n: 32 })
  })
})
