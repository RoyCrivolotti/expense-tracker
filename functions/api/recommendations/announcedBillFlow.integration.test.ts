// @vitest-environment node
/**
 * A bank that announces a bill and later reports the charge, end to end: both pushes go through the real capture Worker
 * into the database the routes read, the review list and each decision go through the real middleware and routes, and
 * the pair is read from the list as the To review screen reads it. Then the same pushes as a Worker that did not read
 * message dates stored them (dated by their arrival), before and after the capture fix tool. Wordings, merchants and amounts are
 * invented; each case varies the amount, the language, how far ahead the bill is announced, how late the charge comes
 * and how near midnight the announcement arrives.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { OWNER, createExpenseWorld, type Handler, type World } from '../../_shared/testing/expenseWorld'
import { createD1AccessRepository } from '../../_shared/adapters/d1AccessRepository'
import { createD1CaptureRepository } from '../../_shared/adapters/d1CaptureRepository'
import { createCaptureKey } from '../../../src/domain/application/captureKeyService'
import { sameBillPairs } from '../../../src/domain/capture/pairs'
import { shiftDay } from '../../../src/domain/capture/reviewDates'
import type { Recommendation } from '../../../src/domain/ports/captureRecommendations'
import { handleCapture } from '../../../workers/capture/src/handle'
import { REDATE_ROWS_SQL, planRedate } from '../../../workers/capture/fix/redate'
import type { RedateRow } from '../../../workers/capture/fix/redate'
import { planReopen } from '../../../workers/capture/fix/reopen'
import { reopenRowsSql } from '../../../workers/capture/fix/reopenRows'
import type { ReopenInput } from '../../../workers/capture/fix/reopenRows'
import { onRequestPost as postAccount } from '../expenses/accounts/index'
import { onRequestPost as postCategory } from '../expenses/categories/index'
import { onRequestDelete as deleteTransaction } from '../expenses/transactions/[id]'
import { onRequestGet as list } from './index'
import { onRequestPost as submit } from './[id]/submit'

let world: World
let sqlite: ReturnType<typeof migratedDatabase>
let accountId: number
let categoryId: number
let bearer: string

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
    name: 'Bills',
    monthlyBudgetCents: 0,
    sortOrder: 0,
    active: true,
  })
  const created = await createCaptureKey(
    createD1CaptureRepository(world.env),
    OWNER,
    'Phone',
    new Date('2027-01-01T00:00:00Z'),
  )
  bearer = created!.key
})

/** Sends one push written at `at` (wall time with offset), received a minute later, and answers its payment's id. */
async function push(
  title: string,
  body: string,
  at: string,
): Promise<string> {
  const env = { DB: world.env.DB, OWNER_EMAIL: OWNER, CAPTURE_REPLAY_SECRET: 'replay-secret' }
  const response = await handleCapture(
    new Request('https://capture.example.test/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ source: 'mybank', title, body, date: at }),
    }),
    env,
    {
      captures: createD1CaptureRepository(env),
      access: createD1AccessRepository(env),
      now: () => new Date(Date.parse(at) + 60_000),
      log: () => undefined,
    },
  )
  expect(response.status).toBe(200)
  return (sqlite.prepare('SELECT rec_id FROM capture_events ORDER BY rowid DESC LIMIT 1').get() as { rec_id: string })
    .rec_id
}

const open = async () =>
  (await (await world.call(list, { path: '/../recommendations' })).json<{ recommendations: Recommendation[] }>())
    .recommendations

/** The pairs the To review screen ties, from the list as the routes answer it. */
const pairs = async () =>
  sameBillPairs(
    (await open()).map((r) => ({
      id: r.id,
      amountCents: r.amountCents ?? 0,
      currency: r.currency,
      suggestedType: r.suggestedType,
      occurredAt: r.occurredAt,
      localDate: r.localDate,
    })),
  )

const row = (
  date: string,
  amountCents: number,
) => ({
  date,
  budgetMonth: date.slice(0, 7),
  description: 'Bill',
  accountId,
  categoryId,
  type: 'expense',
  amountCents,
  cancelled: false,
})

async function add(
  id: string,
  date: string,
  amountCents: number,
): Promise<number> {
  const response = await world.call(submit, {
    method: 'POST',
    path: `/../recommendations/${id}/submit`,
    params: { id },
    body: { ...row(date, amountCents), allowDuplicate: true },
  })
  expect(response.status).toBe(201)
  return (await response.json<{ id: number }>()).id
}

interface Case {
  name: string
  cents: number
  /** How the bank writes the amount. */
  written: string
  arrival: string
  ahead: number
  late: number
  announce: (day: string) => [string, string]
  charge: string
}

const es = (
  date: string,
  written: string,
): [string, string] => [
  'Aviso de recibo',
  `El ${date} se cobrará el recibo de ${written} EUR de Aguas del Valle en la cuenta **0042`,
]
const en = (
  date: string,
  written: string,
): [string, string] => [
  'Upcoming bill',
  `On ${date} the bill from Valley Power of ${written} EUR will be taken from account **0042`,
]
const iso = (day: string) => day
const dmy = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`

const CASES: Case[] = [
  {
    name: 'Spanish, ISO date, a day ahead, charged that day',
    cents: 305,
    written: '3,05',
    arrival: '2027-02-03T21:30:00+01:00',
    ahead: 1,
    late: 0,
    announce: (d) => es(iso(d), '3,05'),
    charge: 'Movimiento de -3,05 EUR en la cuenta **0042',
  },
  {
    name: 'English, d/m/y, a week ahead, arriving two minutes to midnight, charged a week late',
    cents: 124999,
    written: '1.249,99',
    arrival: '2027-04-10T23:58:00+02:00',
    ahead: 7,
    late: 7,
    announce: (d) => en(dmy(d), '1.249,99'),
    charge: 'A movement of -1.249,99 EUR on account **0042',
  },
  {
    name: 'Spanish, d/m/y, across a month end, arriving just after midnight',
    cents: 6420,
    written: '64,20',
    arrival: '2027-06-30T00:02:00+02:00',
    ahead: 2,
    late: 3,
    announce: (d) => es(dmy(d), '64,20'),
    charge: 'Movimiento de -64,20 EUR en la cuenta **0042',
  },
  {
    name: 'English, ISO date, four days ahead, charged a day late',
    cents: 99,
    written: '0,99',
    arrival: '2027-07-27T12:00:00+02:00',
    ahead: 4,
    late: 1,
    announce: (d) => en(iso(d), '0,99'),
    charge: 'A movement of -0,99 EUR on account **0042',
  },
]

/** The bill's named day, and the charge's wall time `late` days after it, early in the morning. */
function days(c: Case): { named: string; chargeAt: string } {
  const named = shiftDay(c.arrival.slice(0, 10), c.ahead)
  return { named, chargeAt: `${shiftDay(named, c.late)}T05:40:00${c.arrival.slice(-6)}` }
}

describe('an announced bill and its charge, through the routes', () => {
  it.each(CASES)('ties the two on the review list: $name', async (c) => {
    const { named, chargeAt } = days(c)
    const announcement = await push(...c.announce(named), c.arrival)
    const charge = await push('Movimiento', c.charge, chargeAt)
    expect((await open()).find((r) => r.id === announcement)?.localDate).toBe(named)
    expect(await pairs()).toEqual([{ announcement, charge }])
  })

  it('does not tie a charge eight days after the named day', async () => {
    const c = CASES[0]!
    const named = shiftDay(c.arrival.slice(0, 10), c.ahead)
    await push(...c.announce(named), c.arrival)
    await push('Movimiento', c.charge, `${shiftDay(named, 8)}T05:40:00+01:00`)
    expect(await pairs()).toEqual([])
  })

  it('keeps a charge within two minutes of the announcement as one payment, which is then not tied', async () => {
    const c = CASES[2]!
    const announcement = await push(...c.announce(shiftDay(c.arrival.slice(0, 10), c.ahead)), c.arrival)
    expect(await push('Movimiento', c.charge, '2027-06-30T00:03:00+02:00')).toBe(announcement)
    expect((await open()).map((r) => r.id)).toEqual([announcement])
    expect(await pairs()).toEqual([])
  })

  it.each(CASES)('offers the added announcement’s expense to its charge: $name', async (c) => {
    const { named, chargeAt } = days(c)
    const announcement = await push(...c.announce(named), c.arrival)
    const expense = await add(announcement, named, c.cents)
    const charge = await push('Movimiento', c.charge, chargeAt)
    expect((await open()).find((r) => r.id === charge)?.possibleMatch?.transactionId).toBe(expense)
  })
})

/** What a Worker that did not read message dates stored: the payment dated by its push's arrival. */
const oldDating = (id: string) =>
  sqlite
    .prepare(
      'UPDATE recommendations SET local_date = (SELECT local_date FROM capture_events WHERE rec_id = ?1) WHERE id = ?1',
    )
    .run(id)

const runSql = (sql: string) =>
  sql
    .split(';\n')
    .filter((s) => s.trim() !== '')
    .map((s) => Number(sqlite.prepare(s).run().changes))

describe('the same bills dated by their arrival, and the capture fix tool', () => {
  it.each(CASES)('ties two waiting payments only once they are re-dated: $name', async (c) => {
    const { named, chargeAt } = days(c)
    const announcement = await push(...c.announce(named), c.arrival)
    oldDating(announcement)
    const charge = await push('Movimiento', c.charge, chargeAt)
    expect(await pairs()).toEqual([])
    const plan = planRedate(sqlite.prepare(REDATE_ROWS_SQL).all() as unknown as RedateRow[])
    expect(runSql(plan.apply)).toEqual([1])
    expect(await pairs()).toEqual([{ announcement, charge }])
  })

  it.each(CASES)('offers nothing for an added one until it is deleted and reopened, then ties it: $name', async (c) => {
    const { named, chargeAt } = days(c)
    const [title, body] = c.announce(named)
    const announcement = await push(title, body, c.arrival)
    oldDating(announcement)
    const arrival = c.arrival.slice(0, 10)
    const expense = await add(announcement, arrival, c.cents)
    const charge = await push('Movimiento', c.charge, chargeAt)
    expect((await open()).find((r) => r.id === charge)?.possibleMatch ?? null).toBeNull()

    const gone = await world.call(deleteTransaction, {
      method: 'DELETE',
      path: `/transactions/${expense}`,
      params: { id: String(expense) },
    })
    expect(gone.status).toBe(200)
    const [recs, events, templates, merchants, counted] = reopenRowsSql(announcement)
      .split(';\n')
      .map((sql) => sqlite.prepare(sql).all())
    const input = { recs, events, templates, merchants, transactions: Number((counted?.[0] as { n: number }).n) }
    const reopen = await planReopen(input as unknown as ReopenInput, { title, body })
    if (!reopen.ok) throw new Error(`refused: ${reopen.refusals.join(', ')}`)
    expect(runSql(reopen.plan.apply)).toEqual(reopen.plan.expectedChanges)
    expect(await pairs()).toEqual([{ announcement, charge }])
  })
})
