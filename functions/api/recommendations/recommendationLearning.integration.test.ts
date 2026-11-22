// @vitest-environment node
/**
 * What a decision teaches the template of the push behind it, end to end: pushes go through the capture Worker into
 * the same database the routes read, and each decision goes through the real middleware and route.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { OWNER, createExpenseWorld, type Handler, type World } from '../../_shared/testing/expenseWorld'
import { createD1CaptureRepository } from '../../_shared/adapters/d1CaptureRepository'
import { EVENT_OF_RECOMMENDATION_SQL } from '../../_shared/capture/captureLearningSql'
import { learnAfterDecision } from '../../../src/domain/application/recommendationService'
import { capturePhone } from '../../_shared/testing/capturePhone'
import { onRequestPost as postAccount } from '../expenses/accounts/index'
import { onRequestPost as postCategory } from '../expenses/categories/index'
import { onRequestPost as postTransaction } from '../expenses/transactions/index'
import { onRequestPost as submit } from './[id]/submit'
import { onRequestPost as dismiss } from './[id]/dismiss'
import { onRequestPost as link } from './[id]/link'

const NOW = new Date('2026-11-03T08:45:00.000Z')
const WITH_CARD = (merchant: string) => `Has pagado 33,40 EUR en ${merchant} con tu tarjeta *4321`
const NO_CARD = (merchant: string) => `Has pagado 33,40 EUR en ${merchant}`

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
  const seeded = async (
    handler: Handler,
    path: string,
    body: unknown,
  ) => (await (await world.call(handler, { method: 'POST', path, body })).json<{ id: number }>()).id
  accountId = await seeded(postAccount, '/accounts', {
    name: 'Debit',
    kind: 'debit',
    settlement: 'immediate',
    active: true,
  })
  categoryId = await seeded(postCategory, '/categories', {
    name: 'Food',
    monthlyBudgetCents: 50_000,
    sortOrder: 0,
    active: true,
  })
  const phone = await capturePhone(world.env.DB, OWNER, NOW)
  push = (body) => phone.push(body)
})

function captures() {
  return createD1CaptureRepository(world.env)
}

function decide(
  handler: Handler,
  id: string,
  body: unknown = {},
) {
  const action = handler === submit ? 'submit' : handler === link ? 'link' : 'dismiss'
  return world.call(handler, { method: 'POST', path: `/../recommendations/${id}/${action}`, params: { id }, body })
}

const row = (
  description: string,
  over: Record<string, unknown> = {},
) => ({
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

type TemplateRow = {
  accepts: number
  dismissals: number
  dismiss_streak: number
  amount_slot: number | null
  amount_mark: string | null
  type: string | null
  account_id: number | null
  ignored_at: string | null
}
const templates = () =>
  sqlite
    .prepare(
      'SELECT accepts, dismissals, dismiss_streak, amount_slot, amount_mark, type, account_id, ignored_at FROM capture_templates ORDER BY first_seen',
    )
    .all() as TemplateRow[]
const outcome = (recId: string) =>
  (sqlite.prepare('SELECT outcome FROM capture_events WHERE rec_id = ?').get(recId) as { outcome: string | null })
    .outcome
const linkCard = () => captures().saveCard(OWNER, { source: 'iberia', digitsKind: 'card', digits: '4321', accountId })

describe('submitting a recommendation', () => {
  it('learns the amount slot, its mark and the type, and records the description and category the person gave', async () => {
    await linkCard()
    const id = (await push(WITH_CARD('Example Cafe')))!
    // A first push has no history: the card showed the bank's words and no category.
    expect((await decide(submit, id, row('Coffee'))).status).toBe(201)

    expect(outcome(id)).toBe('edited:description,category')
    expect(templates()).toEqual([
      {
        accepts: 1,
        dismissals: 0,
        dismiss_streak: 0,
        amount_slot: 4,
        amount_mark: 'comma',
        type: 'expense',
        account_id: null,
        ignored_at: null,
      },
    ])
  })

  it('after editing the amount records edited:amount and learns no slot when no reading matches', async () => {
    await linkCard()
    const id = (await push(WITH_CARD('Example Cafe')))!
    // The bank's words as the card shows them, less the words that hold a digit.
    expect(
      (await decide(submit, id, row('Has pagado EUR en Example Cafe con tu tarjeta', { amountCents: 3000 }))).status,
    ).toBe(201)

    expect(outcome(id)).toBe('edited:amount,category')
    expect(templates()[0]).toMatchObject({ accepts: 1, amount_slot: null, amount_mark: null, type: 'expense' })
  })

  it('names every field the person changed', async () => {
    const id = (await push(WITH_CARD('Example Cafe')))!
    await decide(submit, id, row('Coffee', { type: 'refund' }))

    expect(outcome(id)).toBe('edited:type,account,description,category')
    expect(templates()[0]?.type).toBe('refund')
  })

  it('learns the account from a push that showed no card digits', async () => {
    const id = (await push(NO_CARD('Example Cafe')))!
    await decide(submit, id, row('Coffee'))

    expect(templates()[0]).toMatchObject({ account_id: accountId, amount_slot: 4 })
  })

  it('does not learn the account from a push that showed card digits, which the card link answers for', async () => {
    const id = (await push(WITH_CARD('Example Cafe')))!
    await decide(submit, id, row('Coffee'))

    expect(templates()[0]?.account_id).toBeNull()
  })
})

describe('linking a recommendation', () => {
  it('learns from the row it was linked to and records linked', async () => {
    const id = (await push(NO_CARD('Example Cafe')))!
    const typed = await (
      await world.call(postTransaction, { method: 'POST', path: '/transactions', body: row('Coffee') })
    ).json<{ id: number }>()
    expect((await decide(link, id, { transactionId: typed.id })).status).toBe(200)

    expect(outcome(id)).toBe('linked')
    expect(templates()[0]).toMatchObject({
      accepts: 1,
      amount_slot: 4,
      amount_mark: 'comma',
      type: 'expense',
      account_id: accountId,
    })
  })
})

describe('dismissing', () => {
  it('counts the dismissal and records dismissed', async () => {
    const id = (await push(WITH_CARD('Example Cafe')))!
    expect((await decide(dismiss, id)).status).toBe(200)

    expect(outcome(id)).toBe('dismissed')
    expect(templates()[0]).toMatchObject({ dismissals: 1, dismiss_streak: 1, ignored_at: null })
  })

  it('three times in a row ignores the template, and its next push is counted but not stored', async () => {
    for (const merchant of ['Offer One', 'Offer Two', 'Offer Three']) {
      const id = (await push(WITH_CARD(merchant)))!
      await decide(dismiss, id)
    }
    expect(templates()).toHaveLength(1)
    expect(templates()[0]).toMatchObject({
      dismissals: 3,
      dismiss_streak: 3,
      ignored_at: expect.any(String) as unknown,
    })
    expect(await push(WITH_CARD('Offer Four'))).toBeNull()
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM capture_events').get()).toEqual({ n: 3 })
    expect(sqlite.prepare('SELECT unrecognised FROM capture_counters').get()).toEqual({ unrecognised: 1 })
  })

  it('three times on one merchant mute that merchant, and a push of another is stored and teaches the run', async () => {
    for (let i = 0; i < 3; i++) await decide(dismiss, (await push(WITH_CARD('Offer Shop')))!)
    const muted = () =>
      sqlite.prepare('SELECT skeleton, merchant_start, ignored_at FROM capture_templates').get() as {
        skeleton: string
        merchant_start: number | null
        ignored_at: string | null
      }
    expect(muted()).toMatchObject({ merchant_start: null, ignored_at: expect.any(String) as unknown })
    expect(await push(WITH_CARD('Offer Shop'))).toBeNull()

    expect(await push(WITH_CARD('Example Cafe'))).toEqual(expect.any(String))
    expect(muted().merchant_start).not.toBeNull()
    expect(muted().skeleton).toContain('<M>')
    expect(muted().skeleton).not.toContain('offer')
  })

  it('never ignores a template the person accepted once', async () => {
    await decide(submit, (await push(WITH_CARD('Example Cafe')))!, row('Coffee'))
    for (const merchant of ['Offer One', 'Offer Two', 'Offer Three'])
      await decide(dismiss, (await push(WITH_CARD(merchant)))!)

    expect(templates()[0]).toMatchObject({ accepts: 1, dismiss_streak: 3, ignored_at: null })
  })
})

describe('learning', () => {
  it('teaches the template of the push that made a recommendation, and gives every push behind it the outcome', async () => {
    const id = (await push(NO_CARD('Example Cafe')))!
    // A balance alert of the same amount a minute later joins the recommendation rather than making one.
    expect(await push('Movimiento de -33,40 EUR en tu cuenta **5512')).toBeNull()
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM capture_events WHERE rec_id = ?').get(id)).toEqual({ n: 2 })
    await decide(submit, id, row('Coffee'))

    expect(templates()).toEqual([
      expect.objectContaining({ accepts: 1, amount_slot: 4, type: 'expense', account_id: accountId }),
      expect.objectContaining({ accepts: 0, amount_slot: null, type: null, account_id: null }),
    ])
    const outcomes = sqlite.prepare('SELECT outcome FROM capture_events WHERE rec_id = ? ORDER BY grouped').all(id)
    expect(outcomes).toEqual([
      { outcome: 'edited:account,description,category' },
      { outcome: 'edited:account,description,category' },
    ])
  })

  it('writes the outcome and teaches nothing when the template has gone', async () => {
    const id = (await push(WITH_CARD('Example Cafe')))!
    sqlite.prepare('DELETE FROM capture_templates').run()
    await decide(dismiss, id)

    expect(outcome(id)).toBe('dismissed')
  })

  it('writes the outcome and teaches nothing when the push got no template', async () => {
    const id = (await push(WITH_CARD('Example Cafe')))!
    sqlite.prepare('UPDATE capture_events SET template_id = NULL').run()
    await decide(dismiss, id)

    expect(outcome(id)).toBe('dismissed')
    expect(templates()[0]).toMatchObject({ dismissals: 0 })
  })

  it('counts a decision once however often it runs', async () => {
    const id = (await push(WITH_CARD('Example Cafe')))!
    const rec = (await captures().getRecommendation(OWNER, id))!
    expect((await decide(dismiss, id)).status).toBe(200)
    await learnAfterDecision(captures(), OWNER, rec, { kind: 'dismissed' }, NOW)
    expect((await decide(dismiss, id)).status).toBe(409)

    expect(templates()[0]).toMatchObject({ dismissals: 1, dismiss_streak: 1 })
    expect(outcome(id)).toBe('dismissed')
  })

  it('counts nothing for a second decision of another kind on the same recommendation', async () => {
    const id = (await push(NO_CARD('Example Cafe')))!
    const rec = (await captures().getRecommendation(OWNER, id))!
    await decide(dismiss, id)
    await learnAfterDecision(
      captures(),
      OWNER,
      rec,
      {
        kind: 'submitted',
        saved: { amountCents: 3340, type: 'expense', accountId, description: 'Coffee', categoryId },
      },
      NOW,
    )

    expect(templates()[0]).toMatchObject({ accepts: 0, dismissals: 1, amount_slot: null, type: null, account_id: null })
    expect(outcome(id)).toBe('dismissed')
  })

  it('does nothing for a recommendation no push made', async () => {
    const rec = {
      id: '00000000-0000-4000-8000-000000000001',
      owner: OWNER,
      accountId: null,
      amountCents: 1,
      currency: 'EUR',
      occurredAt: '2026-11-03T09:00:00+01:00',
      localDate: '2026-11-03',
      merchantRaw: null,
      descriptionSuggested: null,
      suggestedType: 'expense' as const,
      createdAt: NOW.toISOString(),
    }
    await captures().createRecommendation(rec)
    expect((await decide(dismiss, rec.id)).status).toBe(200)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM capture_events').get()).toEqual({ n: 0 })
  })

  it('still answers the decision when learning fails, and logs the error class alone', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const id = (await push(WITH_CARD('Example Cafe')))!
    world.intercept((sql) => {
      if (sql === EVENT_OF_RECOMMENDATION_SQL) throw new TypeError(`no such row: ${WITH_CARD('Example Cafe')}`)
    })
    const response = await decide(dismiss, id)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(errors.mock.calls).toEqual([['capture: learning failed', 'TypeError']])
    expect(outcome(id)).toBeNull()
  })
})
