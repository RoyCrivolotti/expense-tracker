import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { createD1AccessRepository } from '../../../functions/_shared/adapters/d1AccessRepository'
import { createD1CaptureRepository } from '../../../functions/_shared/adapters/d1CaptureRepository'
import { createD1ExpenseRepository } from '../../../functions/_shared/adapters/d1ExpenseRepository'
import { mintCaptureKey } from '../../../src/domain/capture'
import type { MintedCaptureKey } from '../../../src/domain/capture'
import {
  dismissRecommendation,
  linkRecommendation,
  listRecommendations,
  submitRecommendation,
} from '../../../src/domain/application/recommendationService'
import { createTransaction } from '../../../src/domain/application/transactionService'
import type { Recommendation } from '../../../src/domain/ports/captureRecommendations'
import type { TxnType } from '../../../src/domain/types'
import { migratedDatabase, sqliteD1 } from '../../../src/testing/sqliteD1'
import type { CaptureEnv } from './env'
import { handleCapture } from './handle'

/*
 * A bank that announces a bill the evening before and then reports the charge sends two pushes for one payment. These
 * run both pushes through the capture Worker and read the offer from the open list, as the To review card does, for
 * every way the first one may have been decided. Wordings, merchants and amounts are invented.
 */

const ALICE = 'alice@example.com'
const NOW = new Date('2026-11-26T12:00:00.000Z')

let db: DatabaseSync
let env: CaptureEnv
let key: MintedCaptureKey

const captures = () => createD1CaptureRepository(env)
const expenses = () => createD1ExpenseRepository(env)

beforeEach(async () => {
  db = migratedDatabase()
  env = { DB: sqliteD1(db), OWNER_EMAIL: ALICE, CAPTURE_REPLAY_SECRET: 'replay-secret' }
  await createD1AccessRepository(env).grantAccess(ALICE, ALICE)
  key = await mintCaptureKey()
  await captures().createKey({
    keyId: key.keyId,
    owner: ALICE,
    label: 'Phone',
    secretHash: key.secretHash,
    createdAt: NOW.toISOString(),
  })
  db.exec(
    "INSERT INTO accounts (id, owner, name, kind, settlement, active) VALUES (1, 'alice@example.com', 'Main', 'debit', 'immediate', 1)",
  )
  db.exec(
    "INSERT INTO categories (id, owner, name, monthly_budget_cents, sort_order, active) VALUES (1, 'alice@example.com', 'Bills', 0, 1, 1)",
  )
})

/** Sends one push, received a minute later, and answers the id of the recommendation it made. `at` is UTC+1. */
async function send(
  title: string,
  body: string,
  at: string,
): Promise<string> {
  const before = new Set((await open()).map((r) => r.id))
  const request = new Request('https://capture.example.test/capture', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key.key}` },
    body: JSON.stringify({ source: 'mybank', title, body, date: `${at}:00+01:00` }),
  })
  const response = await handleCapture(request, env, {
    captures: captures(),
    access: createD1AccessRepository(env),
    now: () => new Date(Date.parse(`${at}:00+01:00`) + 60_000),
    log: () => {},
  })
  expect(response.status).toBe(200)
  const made = (await open()).find((r) => !before.has(r.id))
  if (!made) throw new Error('the push made no recommendation')
  return made.id
}

const open = async (): Promise<Recommendation[]> => (await listRecommendations(captures(), ALICE, 50)).recommendations
const offerOf = async (id: string) => (await open()).find((r) => r.id === id)?.possibleMatch ?? null
const recRow = (id: string) =>
  db.prepare('SELECT state, txn_id FROM recommendations WHERE id = ?').get(id) as {
    state: string
    txn_id: number | null
  }
const rowCount = () => (db.prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number }).n

const announce = (
  amount: string,
  on: string,
  at: string,
  payee = 'Water Example',
) =>
  send('Upcoming bill', `On ${on} the bill from ${payee} of ${amount} EUR will be charged to your account **5512`, at)
const charge = (
  amount: string,
  at: string,
) => send('Account movement', `A movement of ${amount} EUR on your account **5512`, at)
const card = (
  amount: string,
  at: string,
  shop = 'Cafe Example',
) => send('Card payment', `${shop} *4321 ${amount} EUR`, at)

const entry = (
  date: string,
  amountCents: number,
  type: TxnType = 'expense',
  description = 'Water bill',
) => ({
  date,
  budgetMonth: date.slice(0, 7),
  description,
  accountId: 1,
  categoryId: 1,
  type,
  amountCents,
  cancelled: false,
})

/** Adds the payment from its card, as the person does with Add, and answers the row it made. */
async function save(
  id: string,
  row: ReturnType<typeof entry>,
): Promise<number> {
  const saved = await submitRecommendation(captures(), expenses(), ALICE, id, row, NOW)
  if (!saved.ok || !('transaction' in saved)) throw new Error(`not saved: ${JSON.stringify(saved)}`)
  return saved.transaction.id
}

/** A row the person typed in the app themselves. */
async function typed(row: ReturnType<typeof entry>): Promise<number> {
  return (await createTransaction(expenses(), ALICE, row)).id
}

describe('a bill announced, then charged', () => {
  it('offers the row added from the announcement to the charge, and Link moves it there with no second row', async () => {
    const announced = await announce('47,15', '25/11/2026', '2026-11-24T21:32')
    const row = await save(announced, entry('2026-11-25', 4715))
    const charged = await charge('-47,15', '2026-11-25T06:10')

    expect(await offerOf(charged)).toEqual({ transactionId: row, description: 'Water bill', date: '2026-11-25' })
    expect(await linkRecommendation(captures(), expenses(), ALICE, charged, row, NOW)).toEqual({ ok: true })
    expect(recRow(charged)).toEqual({ state: 'submitted', txn_id: row })
    expect(recRow(announced)).toEqual({ state: 'submitted', txn_id: null })
    expect(await open()).toEqual([])
    expect(rowCount()).toBe(1)
  })

  it('offers it when the announcement was linked to a row typed by hand', async () => {
    const row = await typed(entry('2026-11-25', 4715))
    const announced = await announce('47,15', '25/11/2026', '2026-11-24T21:32')
    expect(await offerOf(announced)).toMatchObject({ transactionId: row })
    await linkRecommendation(captures(), expenses(), ALICE, announced, row, NOW)
    const charged = await charge('-47,15', '2026-11-25T06:10')

    expect(await offerOf(charged)).toMatchObject({ transactionId: row })
    expect(await linkRecommendation(captures(), expenses(), ALICE, charged, row, NOW)).toEqual({ ok: true })
    expect(recRow(announced)).toEqual({ state: 'submitted', txn_id: null })
  })

  it('offers a row typed by hand, as before, when the announcement was dismissed', async () => {
    const announced = await announce('47,15', '25/11/2026', '2026-11-24T21:32')
    await dismissRecommendation(captures(), ALICE, announced, NOW)
    const row = await typed(entry('2026-11-25', 4715))
    const charged = await charge('-47,15', '2026-11-25T06:10')

    expect(await offerOf(charged)).toMatchObject({ transactionId: row })
  })

  it('offers nothing when the announcement was dismissed and nothing was typed', async () => {
    const announced = await announce('47,15', '25/11/2026', '2026-11-24T21:32')
    await dismissRecommendation(captures(), ALICE, announced, NOW)
    const charged = await charge('-47,15', '2026-11-25T06:10')

    expect(await offerOf(charged)).toBeNull()
  })

  it('offers it for a bill announced days ahead and booked a day late, under another wording and amount', async () => {
    const announced = await announce('1.032,60', '23/11/2026', '2026-11-20T18:05', 'Insurance Example')
    const row = await save(announced, entry('2026-11-23', 103_260, 'expense', 'Home insurance'))
    const charged = await charge('-1.032,60', '2026-11-24T09:47')

    expect(await offerOf(charged)).toMatchObject({ transactionId: row, date: '2026-11-23' })
  })

  it('offers it for money announced to come in, then credited', async () => {
    const announced = await send(
      'Incoming transfer',
      'On 26/11/2026 a transfer of 820,00 EUR will be credited to your account **5512',
      '2026-11-25T20:00',
    )
    const row = await save(announced, entry('2026-11-26', 82_000, 'income', 'Salary'))
    const credited = await charge('+820,00', '2026-11-26T07:30')

    expect(await offerOf(credited)).toMatchObject({ transactionId: row })
  })

  it('offers it when the charge was added first and the announcement is reviewed after it', async () => {
    const announced = await announce('47,15', '25/11/2026', '2026-11-24T21:32')
    const charged = await charge('-47,15', '2026-11-25T06:10')
    const row = await save(charged, entry('2026-11-25', 4715))

    expect(await offerOf(announced)).toMatchObject({ transactionId: row })
    expect(await linkRecommendation(captures(), expenses(), ALICE, announced, row, NOW)).toEqual({ ok: true })
    expect([recRow(announced), recRow(charged)]).toEqual([
      { state: 'submitted', txn_id: row },
      { state: 'submitted', txn_id: null },
    ])
  })

  it.each([
    ['on the day it named', '2026-11-25T06:10', true],
    ['seven days after it', '2026-12-02T06:10', true],
    ['eight days after it', '2026-12-03T06:10', false],
    ['the day before it', '2026-11-24T23:10', false],
  ])('pairs a charge reported %s: %s, offered %s', async (_when, at, offered) => {
    const announced = await announce('47,15', '25/11/2026', '2026-11-24T21:32')
    const row = await save(announced, entry('2026-11-25', 4715))
    const charged = await charge('-47,15', at)

    expect(await offerOf(charged)).toEqual(offered ? expect.objectContaining({ transactionId: row }) : null)
    expect(await linkRecommendation(captures(), expenses(), ALICE, charged, row, NOW)).toEqual(
      offered ? { ok: true } : { ok: false, reason: 'taken' },
    )
  })

  it('refuses the Add of the charge as a possible duplicate, as the card does, and adds it when told to', async () => {
    const announced = await announce('47,15', '25/11/2026', '2026-11-24T21:32')
    const row = await save(announced, entry('2026-11-25', 4715))
    const charged = await charge('-47,15', '2026-11-25T06:10')

    expect(await submitRecommendation(captures(), expenses(), ALICE, charged, entry('2026-11-25', 4715), NOW)).toEqual({
      ok: false,
      reason: 'possible-duplicate',
      possibleMatch: { transactionId: row, description: 'Water bill', date: '2026-11-25' },
    })
    expect(rowCount()).toBe(1)
    const added = await submitRecommendation(
      captures(),
      expenses(),
      ALICE,
      charged,
      entry('2026-11-25', 4715),
      NOW,
      true,
    )
    expect(added.ok).toBe(true)
    expect(rowCount()).toBe(2)
  })
})

describe('pushes that are two payments', () => {
  it('never offer the first charge’s row to a second charge of the same price', async () => {
    const first = await charge('-47,15', '2026-11-25T06:10')
    const row = await save(first, entry('2026-11-25', 4715))
    const second = await charge('-47,15', '2026-11-25T18:20')

    expect(await offerOf(second)).toBeNull()
    expect(await linkRecommendation(captures(), expenses(), ALICE, second, row, NOW)).toEqual({
      ok: false,
      reason: 'taken',
    })
    expect(recRow(first)).toEqual({ state: 'submitted', txn_id: row })
  })

  it('never offer a coffee added from its card to the next coffee, at the same or another cafe', async () => {
    const first = await card('3,40', '2026-11-25T08:15')
    await save(first, entry('2026-11-25', 340, 'expense', 'Coffee'))

    expect(await offerOf(await card('3,40', '2026-11-25T16:02'))).toBeNull()
    expect(await offerOf(await card('3,40', '2026-11-26T08:11', 'Bakery Example'))).toBeNull()
  })

  it('never offer a row added from a card payment to a charge of the same price under another wording', async () => {
    const paid = await card('47,15', '2026-11-24T13:00', 'Shop Example')
    await save(paid, entry('2026-11-24', 4715, 'expense', 'Shoes'))

    expect(await offerOf(await charge('-47,15', '2026-11-25T06:10'))).toBeNull()
  })

  it('never offer one announced bill’s row to a second announcement of the same price', async () => {
    const first = await announce('9,99', '25/11/2026', '2026-11-24T20:00', 'Music Example')
    await save(first, entry('2026-11-25', 999, 'expense', 'Music'))

    expect(await offerOf(await announce('9,99', '25/11/2026', '2026-11-24T20:05', 'Video Example'))).toBeNull()
  })

  it('never offer the row again once a charge took it from its announcement', async () => {
    const announced = await announce('47,15', '25/11/2026', '2026-11-24T21:32')
    const row = await save(announced, entry('2026-11-25', 4715))
    const charged = await charge('-47,15', '2026-11-25T06:10')
    await linkRecommendation(captures(), expenses(), ALICE, charged, row, NOW)

    expect(await offerOf(await charge('-47,15', '2026-11-26T06:10'))).toBeNull()
  })

  it('give each of two announced bills of one price to its own charge', async () => {
    const music = await announce('9,99', '25/11/2026', '2026-11-24T20:00', 'Music Example')
    const video = await announce('9,99', '25/11/2026', '2026-11-24T20:05', 'Video Example')
    const rowMusic = await save(music, entry('2026-11-25', 999, 'expense', 'Music'))
    const rowVideo = await save(video, entry('2026-11-25', 999, 'expense', 'Video'))
    const first = await charge('-9,99', '2026-11-25T06:10')
    const second = await charge('-9,99', '2026-11-25T06:20')

    const offered = [(await offerOf(first))?.transactionId, (await offerOf(second))?.transactionId]
    expect(new Set(offered)).toEqual(new Set([rowMusic, rowVideo]))
  })

  it('never offer an earlier card payment’s row to a bill announced later, nor to its charge', async () => {
    const paid = await card('47,15', '2026-11-19T13:00', 'Shop Example')
    const shoes = await save(paid, entry('2026-11-19', 4715, 'expense', 'Shoes'))
    const announced = await announce('47,15', '26/11/2026', '2026-11-25T21:00')

    expect(await offerOf(announced)).toBeNull()
    expect(await linkRecommendation(captures(), expenses(), ALICE, announced, shoes, NOW)).toEqual({
      ok: false,
      reason: 'taken',
    })
    expect(await offerOf(await charge('-47,15', '2026-11-26T06:10'))).toBeNull()
  })

  it('never offer last week’s bill to this week’s announcement or charge of the same price', async () => {
    const week1 = await announce('9,99', '18/11/2026', '2026-11-17T20:00', 'Music Example')
    const row = await save(week1, entry('2026-11-18', 999, 'expense', 'Music'))
    const charged1 = await charge('-9,99', '2026-11-18T06:10')
    await linkRecommendation(captures(), expenses(), ALICE, charged1, row, NOW)
    const week2 = await announce('9,99', '25/11/2026', '2026-11-24T20:00', 'Music Example')

    expect(await offerOf(week2)).toBeNull()
    expect(await offerOf(await charge('-9,99', '2026-11-25T06:10'))).toBeNull()
  })

  it('never offer a saved bill to a payment of its price made before the day it named', async () => {
    const announced = await announce('47,15', '25/11/2026', '2026-11-24T21:32')
    const row = await save(announced, entry('2026-11-25', 4715))
    const paid = await card('47,15', '2026-11-24T22:10', 'Shop Example')

    expect(await offerOf(paid)).toBeNull()
    expect(await offerOf(await charge('-47,15', '2026-11-25T06:10'))).toMatchObject({ transactionId: row })
  })

  it('never offer a saved bill whose charge was dismissed to a charge of its price eight days later', async () => {
    const announced = await announce('47,15', '25/11/2026', '2026-11-24T21:32')
    await save(announced, entry('2026-11-25', 4715))
    await dismissRecommendation(captures(), ALICE, await charge('-47,15', '2026-11-25T06:10'), NOW)

    expect(await offerOf(await charge('-47,15', '2026-12-03T06:10'))).toBeNull()
  })

  it('never offer a movement dated by its value date to a card payment before that date', async () => {
    const moved = await send(
      'Account movement',
      'A movement of -12,00 EUR value date 27/11/2026 on **5512',
      '2026-11-25T09:00',
    )
    await save(moved, entry('2026-11-27', 1200, 'expense', 'Transfer'))

    expect(await offerOf(await card('12,00', '2026-11-26T10:00'))).toBeNull()
  })
})

describe('taking a row over', () => {
  it('leaves the holder untouched when the payment taking it was decided in between', async () => {
    const announced = await announce('47,15', '25/11/2026', '2026-11-24T21:32')
    const row = await save(announced, entry('2026-11-25', 4715))
    const charged = await charge('-47,15', '2026-11-25T06:10')
    await dismissRecommendation(captures(), ALICE, charged, NOW)

    expect(
      await captures().decideRecommendation(ALICE, charged, {
        state: 'submitted',
        txnId: row,
        at: NOW.toISOString(),
        takeFrom: announced,
      }),
    ).toBe(false)
    expect(recRow(announced)).toEqual({ state: 'submitted', txn_id: row })
  })
  it('still decides when the holder had let the row go in between', async () => {
    const announced = await announce('47,15', '25/11/2026', '2026-11-24T21:32')
    const row = await typed(entry('2026-11-25', 4715))
    const charged = await charge('-47,15', '2026-11-25T06:10')

    expect(
      await captures().decideRecommendation(ALICE, charged, {
        state: 'submitted',
        txnId: row,
        at: NOW.toISOString(),
        takeFrom: announced,
      }),
    ).toBe(true)
    expect([recRow(charged), recRow(announced)]).toEqual([
      { state: 'submitted', txn_id: row },
      { state: 'open', txn_id: null },
    ])
  })
})
