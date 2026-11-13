// @vitest-environment node
/**
 * The card link routes through the real middleware and migrations: a link is the signed-in person's own, to an account
 * of theirs, written once however often it is sent, and never shows its digits in an error or a log.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { OTHER, OWNER, createExpenseWorld, type Handler, type World } from '../../_shared/testing/expenseWorld'
import { invokeExpenseApiRoute } from '../../_shared/testing/invokeExpenseApiRoute'
import { createD1ExpenseRepository } from '../../_shared/adapters/d1ExpenseRepository'
import { createD1CaptureRepository } from '../../_shared/adapters/d1CaptureRepository'
import { MAX_CAPTURE_CARDS } from '../../../src/domain/ports/captureRepository'
import { onRequestDelete as remove, onRequestGet as list, onRequestPost as link } from './index'

let world: World
let sqlite: ReturnType<typeof migratedDatabase>
let logged: unknown[][]

const T0 = '2026-03-02T09:00:00.000Z'
// Invented digits.
const DIGITS = '4821'

beforeEach(() => {
  sqlite = migratedDatabase()
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  logged = []
  for (const level of ['warn', 'error', 'log', 'info'] as const) vi.spyOn(console, level).mockImplementation((...args) => void logged.push(args))
  const account = sqlite.prepare("INSERT INTO accounts (id, owner, name, kind, settlement, active) VALUES (?, ?, 'Account', 'debit', 'immediate', 1)")
  account.run(1, OWNER)
  account.run(2, OWNER)
  account.run(9, OTHER)
})

function call(handler: Handler, o: { method?: string; body?: unknown; rawBody?: BodyInit; headers?: Record<string, string>; email?: string | false } = {}): Promise<Response> {
  return invokeExpenseApiRoute({
    handler,
    repo: createD1ExpenseRepository(world.env),
    env: world.env,
    url: 'https://expenses.test/api/capture-cards',
    method: o.method ?? 'GET',
    email: o.email ?? OWNER,
    ...(o.body !== undefined ? { body: o.body } : {}),
    ...(o.rawBody !== undefined ? { rawBody: o.rawBody } : {}),
    ...(o.headers ? { extraHeaders: o.headers } : {}),
  })
}

const post = (body: unknown, email = OWNER) => call(link, { method: 'POST', body, email })
const del = (body: unknown, email = OWNER) => call(remove, { method: 'DELETE', body, email })
const links = () => sqlite.prepare('SELECT owner, source, digits_kind, digits, account_id FROM capture_cards ORDER BY owner, source, digits').all()
const good = { source: 'iberia', digits: DIGITS, accountId: 1 }

describe('POST /api/capture-cards', () => {
  it('links the digits to the account for the signed-in person, and answers ok', async () => {
    const response = await post(good)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(links()).toEqual([{ owner: OWNER, source: 'iberia', digits_kind: 'card', digits: DIGITS, account_id: 1 }])
  })

  it('takes the owner from the sign-in, never from the body', async () => {
    await post({ ...good, owner: OTHER })

    expect(links()).toMatchObject([{ owner: OWNER }])
  })

  it('is idempotent, and sending it again for another account moves it', async () => {
    await post(good)
    await post(good)
    expect(links()).toHaveLength(1)

    await post({ ...good, accountId: 2 })

    expect(links()).toMatchObject([{ account_id: 2 }])
  })

  it('keeps two bank apps with the same digits apart, and lets two digit sets share an account', async () => {
    await post(good)
    await post({ ...good, source: 'santander' })
    await post({ ...good, digits: '5533' })

    expect(links()).toHaveLength(3)
  })

  it('accepts an account kind', async () => {
    await post({ ...good, source: 'santander', digitsKind: 'account' })

    expect(links()).toMatchObject([{ digits_kind: 'account' }])
  })

  it("refuses another person's account and one that does not exist with 404, and stores nothing", async () => {
    expect((await post({ ...good, accountId: 9 })).status).toBe(404)
    expect((await post({ ...good, accountId: 404 })).status).toBe(404)

    expect(links()).toEqual([])
  })

  it('refuses a link past the cap with 409, but still takes one that exists', async () => {
    const repo = createD1CaptureRepository(world.env)
    for (let i = 0; i < MAX_CAPTURE_CARDS; i++) await repo.linkCard(OWNER, { source: 'iberia', digitsKind: 'card', digits: String(1000 + i), accountId: 1 })

    expect((await post({ ...good, digits: '9999' })).status).toBe(409)
    expect((await post({ ...good, digits: '1000', accountId: 2 })).status).toBe(200)
  })

  it.each([
    ['an unknown source', { ...good, source: 'bbva' }],
    ['no source', { digits: DIGITS, accountId: 1 }],
    ['three digits', { ...good, digits: '482' }],
    ['five digits', { ...good, digits: '48211' }],
    ['letters', { ...good, digits: '48a1' }],
    ['digits as a number', { ...good, digits: 4821 }],
    ['an unknown kind', { ...good, digitsKind: 'phone' }],
    ['no account', { source: 'iberia', digits: DIGITS }],
    ['account zero', { ...good, accountId: 0 }],
    ['a negative account', { ...good, accountId: -1 }],
    ['a fractional account', { ...good, accountId: 1.5 }],
    ['an account as text', { ...good, accountId: '1' }],
    ['a list', [good]],
    ['a number', 7],
  ])('refuses %s with 400, stores nothing, and does not echo what was sent', async (_name, body) => {
    const response = await post(body)
    const text = await response.text()

    expect(response.status).toBe(400)
    expect(text).not.toContain(DIGITS)
    expect(links()).toEqual([])
  })

  it('refuses a body over its cap with 413, and one that is not JSON with 400', async () => {
    const json = { 'content-type': 'application/json' }
    expect((await call(link, { method: 'POST', rawBody: JSON.stringify({ ...good, pad: 'x'.repeat(2000) }), headers: json })).status).toBe(413)
    expect((await call(link, { method: 'POST', rawBody: '{nope', headers: json })).status).toBe(400)
  })

  it('never writes the digits to a log, whether it worked or was refused', async () => {
    await post(good)
    await post({ ...good, accountId: 404 })
    await post({ ...good, digits: '48x1' })
    await del(good)

    expect(JSON.stringify(logged)).not.toContain(DIGITS)
  })
})

describe('GET /api/capture-cards', () => {
  it('lists the links and the cards payments wait on, for the signed-in person only', async () => {
    const repo = createD1CaptureRepository(world.env)
    await repo.createKey({ keyId: 'k1', owner: OWNER, label: 'Phone', secretHash: 'h', createdAt: T0 })
    await repo.recordCapture(
      { id: 'e1', keyId: 'k1', source: 'iberia', replayKey: 'r1', kind: 'card-purchase', amountCents: -100, currency: 'EUR', merchantRaw: 'X', last4: '5533', accountDigits: null, occurredAt: T0, localDate: '2026-03-02', offsetMinutes: 60, receivedAt: T0, bodyExcerpt: null },
      { id: 'rec1', accountId: null, amountCents: 100, currency: 'EUR', occurredAt: T0, localDate: '2026-03-02', merchantRaw: 'X', descriptionSuggested: null, suggestedType: 'expense', createdAt: T0 },
    )
    await post(good)

    const mine = (await (await call(list)).json()) as { cards: unknown[]; waiting: unknown[] }
    const theirs = (await (await call(list, { email: OTHER })).json()) as { cards: unknown[]; waiting: unknown[] }

    expect(mine.cards).toEqual([{ source: 'iberia', digitsKind: 'card', digits: DIGITS, accountId: 1 }])
    expect(mine.waiting).toEqual([{ source: 'iberia', digits: '5533', count: 1 }])
    expect(theirs).toEqual({ cards: [], waiting: [] })
  })
})

describe('DELETE /api/capture-cards', () => {
  it('removes the named link and answers ok, then 404 for the same again', async () => {
    await post(good)

    expect((await del(good)).status).toBe(200)
    expect(links()).toEqual([])
    expect((await del(good)).status).toBe(404)
  })

  it("cannot remove another person's link, and says 404 as if it were not there", async () => {
    await post(good)

    expect((await del(good, OTHER)).status).toBe(404)
    expect(links()).toHaveLength(1)
  })

  it.each([
    ['no digits', { source: 'iberia' }],
    ['an unknown source', { source: 'x', digits: DIGITS }],
    ['bad digits', { source: 'iberia', digits: '12' }],
  ])('refuses %s with 400', async (_name, body) => {
    expect((await del(body)).status).toBe(400)
  })
})

describe('an unexpected failure', () => {
  it.each([
    ['listing', () => call(list)],
    ['linking', () => post(good)],
    ['removing', () => del(good)],
  ])('answers a fixed 500 when %s fails, and the log never holds the message or the digits', async (_name, run) => {
    // Only the capture statements break, so the sign-in around the route still works.
    const real = world.env.DB
    world.env.DB = {
      ...real,
      prepare: (sql: string) => {
        if (/capture_cards|capture_events/.test(sql)) throw new Error(`D1_ERROR: constraint failed near '${DIGITS}'`)
        return real.prepare(sql)
      },
      batch: real.batch.bind(real),
    } as unknown as typeof world.env.DB

    const response = await run()

    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain(DIGITS)
    expect(JSON.stringify(logged, (_k, v) => (v instanceof Error ? v.message : v))).not.toContain(DIGITS)
    expect(JSON.stringify(logged)).toContain('unexpected error')
  })
})
