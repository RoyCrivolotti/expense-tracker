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
  submitRecommendation,
} from '../../../src/domain/application/recommendationService'
import { createTransaction } from '../../../src/domain/application/transactionService'
import { migratedDatabase, sqliteD1 } from '../../../src/testing/sqliteD1'
import type { CaptureEnv } from '../src/env'
import { handleCapture } from '../src/handle'
import { REDATE_ROWS_SQL, planRedate } from './redate'
import type { RedateRow, RedateVerdict } from './redate'

/*
 * The re-dating planner, first on rows written by hand, then over pushes stored by the real capture Worker into a
 * migrated database, with the rows a Worker that did not read message dates would have written made by putting
 * `local_date` back to the arrival day (the only column such a Worker wrote differently). Wordings, merchants, amounts and owners are invented.
 */

const row = (over: Partial<RedateRow> = {}): RedateRow => ({
  id: 'rec-a',
  owner: 'robin@example.com',
  state: 'open',
  local_date: '2027-03-08',
  occurred_at: '2027-03-08T21:40:00+01:00',
  amount_cents: 4107,
  grouped: 0,
  arrival: '2027-03-08',
  received_at: '2027-03-08T20:41:00.000Z',
  body: 'El 2027-03-10 se cargará el recibo de 41,07 EUR',
  slots: '[{"kind":"date","index":1,"iso":"2027-03-10"}]',
  ...over,
})

const verdictOf = (rows: RedateRow[]) => planRedate(rows).entries[0]

describe('planRedate: which payments move', () => {
  it('moves an open payment whose words name another day, and only its local_date', () => {
    const plan = planRedate([row()])
    expect(plan.entries).toEqual([
      { id: 'rec-a', amountCents: 4107, verdict: 'redate', from: '2027-03-08', to: '2027-03-10' },
    ])
    expect(plan.apply).toBe(
      "UPDATE recommendations SET local_date = '2027-03-10' WHERE owner = 'robin@example.com' AND id = 'rec-a' AND state = 'open' AND local_date = '2027-03-08' AND occurred_at = '2027-03-08T21:40:00+01:00';\n",
    )
    expect(plan.undo).toBe(
      "UPDATE recommendations SET local_date = '2027-03-08' WHERE owner = 'robin@example.com' AND id = 'rec-a' AND state = 'open' AND local_date = '2027-03-10' AND occurred_at = '2027-03-08T21:40:00+01:00';\n",
    )
  })

  it.each<[string, Partial<RedateRow>, RedateVerdict]>([
    ['added', { state: 'submitted' }, 'decided'],
    ['dismissed', { state: 'dismissed' }, 'decided'],
    ['with no text left', { body: null }, 'no-text'],
    ['already dated from its words', { local_date: '2027-03-10' }, 'already-dated'],
    ['naming no day', { body: 'Compra de 41,07 EUR en Tienda Ejemplo', slots: '[]' }, 'no-date'],
    ['naming its own arrival day', { body: 'El 2027-03-08 se cargará 41,07 EUR' }, 'no-date'],
    ['naming a day 11 days ahead', { body: 'El 2027-03-19 se cargará 41,07 EUR' }, 'no-date'],
    ['whose stored date slot disagrees', { slots: '[{"kind":"date","index":0,"iso":"2027-03-09"}]' }, 'needs-a-look'],
    ['whose slots cannot be read', { slots: '{"kind":"date"' }, 'needs-a-look'],
    ['whose slots are not a list', { slots: '{"kind":"date"}' }, 'needs-a-look'],
  ])('leaves a payment %s', (_name, over, verdict) => {
    const plan = planRedate([row(over)])
    expect(plan.entries[0]?.verdict).toBe(verdict)
    expect(plan.apply).toBe('')
  })

  it('moves a payment whose slots hold no date and one with no slots at all', () => {
    expect(verdictOf([row({ slots: '[{"kind":"code","index":3}]' })])?.verdict).toBe('redate')
    expect(verdictOf([row({ slots: null })])?.verdict).toBe('redate')
  })

  it('skips a body cut at the column length, and reads one a character shorter', () => {
    const named = 'El 2027-03-10 se cargará 41,07 EUR '
    expect(verdictOf([row({ body: named + 'x'.repeat(500 - named.length) })])?.verdict).toBe('cut')
    expect(verdictOf([row({ body: named + 'x'.repeat(499 - named.length) })])?.verdict).toBe('redate')
  })

  it('dates a payment from its first push, not from a push that joined it', () => {
    const joiner = row({ grouped: 1, body: 'Movimiento de -41,07 EUR en tu cuenta', slots: '[]' })
    expect(verdictOf([joiner, row()])).toMatchObject({ verdict: 'redate', to: '2027-03-10' })
    const namesAnother = row({ grouped: 1, body: 'El 2027-03-12 se cargará 41,07 EUR' })
    expect(verdictOf([namesAnother, row({ body: 'Compra de 41,07 EUR', slots: '[]' })])?.verdict).toBe('no-date')
  })

  it('leaves a payment with no push of its own', () => {
    expect(verdictOf([row({ grouped: 1 })])?.verdict).toBe('no-first-push')
    expect(verdictOf([row({ grouped: null, arrival: null, body: null, slots: null })])?.verdict).toBe('no-first-push')
  })

  it('measures the window from the phone’s day, never the UTC day the server received it', () => {
    // 00:30 in Madrid on 31 October is 22:30 UTC on the 30th. 10 November is 10 days after the first, 11 after the second.
    const late = row({
      local_date: '2027-10-31',
      occurred_at: '2027-10-31T00:30:00+02:00',
      arrival: '2027-10-31',
      received_at: '2027-10-30T22:31:00.000Z',
      body: 'Cargo de 41,07 EUR el 10/11/2027',
      slots: '[{"kind":"date","index":4,"iso":"2027-11-10"}]',
    })
    expect(verdictOf([late])).toMatchObject({ verdict: 'redate', from: '2027-10-31', to: '2027-11-10' })
  })

  it('quotes text so an owner or id with a quote mark stays inside its literal', () => {
    const plan = planRedate([row({ owner: "o'neil@example.com", id: "rec-'a" })])
    expect(plan.apply).toContain("owner = 'o''neil@example.com' AND id = 'rec-''a'")
  })
})

const OWNER = 'robin@example.com'

let db: DatabaseSync
let env: CaptureEnv
let key: MintedCaptureKey

const captures = () => createD1CaptureRepository(env)
const expenses = () => createD1ExpenseRepository(env)

beforeEach(async () => {
  db = migratedDatabase()
  env = { DB: sqliteD1(db), OWNER_EMAIL: OWNER, CAPTURE_REPLAY_SECRET: 'replay-secret' }
  await createD1AccessRepository(env).grantAccess(OWNER, OWNER)
  key = await mintCaptureKey()
  await captures().createKey({
    keyId: key.keyId,
    owner: OWNER,
    label: 'Phone',
    secretHash: key.secretHash,
    createdAt: '2027-01-01T00:00:00.000Z',
  })
  db.exec(
    `INSERT INTO accounts (id, owner, name, kind, settlement, active) VALUES (1, '${OWNER}', 'Main', 'debit', 'immediate', 1)`,
  )
  db.exec(
    `INSERT INTO categories (id, owner, name, monthly_budget_cents, sort_order, active) VALUES (1, '${OWNER}', 'Bills', 0, 1, 1)`,
  )
})

/** Sends one push through the Worker, received a minute after `at` (wall time with offset), and answers its payment. */
async function push(
  title: string,
  body: string,
  at: string,
): Promise<string> {
  const request = new Request('https://capture.example.test/capture', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key.key}` },
    body: JSON.stringify({ source: 'mybank', title, body, date: at }),
  })
  const response = await handleCapture(request, env, {
    captures: captures(),
    access: createD1AccessRepository(env),
    now: () => new Date(Date.parse(at) + 60_000),
    log: () => {},
  })
  expect(response.status).toBe(200)
  return (db.prepare('SELECT rec_id FROM capture_events ORDER BY rowid DESC LIMIT 1').get() as { rec_id: string })
    .rec_id
}

/** What a Worker that did not read message dates stored: the payment dated by its first push's arrival. */
const oldDating = (id: string) =>
  db
    .prepare(
      'UPDATE recommendations SET local_date = (SELECT local_date FROM capture_events WHERE rec_id = ?1 AND grouped = 0) WHERE id = ?1',
    )
    .run(id)

const rows = () => db.prepare(REDATE_ROWS_SQL).all() as unknown as RedateRow[]
const dayOf = (id: string) =>
  (db.prepare('SELECT local_date FROM recommendations WHERE id = ?').get(id) as { local_date: string }).local_date

/** Runs a record file statement by statement and answers each one's `changes`. */
const run = (sql: string) =>
  sql
    .split(';\n')
    .filter((s) => s.trim() !== '')
    .map((s) => Number(db.prepare(s).run().changes))

/** Every table's rows in order, so a test can tell whether anything else moved. */
function snapshot(): Record<string, string[]> {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{
    name: string
  }>
  // Some tables have no rowid, so rows are put in order by their text.
  const sorted = (name: string) =>
    (db.prepare(`SELECT * FROM "${name}"`).all() as unknown[]).map((r) => JSON.stringify(r)).sort()
  return Object.fromEntries(tables.map(({ name }) => [name, sorted(name)]))
}

const entry = (
  date: string,
  amountCents: number,
) => ({
  date,
  budgetMonth: date.slice(0, 7),
  description: 'Bill',
  accountId: 1,
  categoryId: 1,
  type: 'expense' as const,
  amountCents,
  cancelled: false,
})
const NOW = new Date('2027-11-12T12:00:00.000Z')

/** A store with every kind of payment the planner must tell apart, and the verdict each should get. */
async function seed(): Promise<Map<string, [RedateVerdict, string | null]>> {
  const want = new Map<string, [RedateVerdict, string | null]>()
  const old = async (
    verdict: RedateVerdict,
    to: string | null,
    title: string,
    body: string,
    at: string,
  ) => {
    const id = await push(title, body, at)
    oldDating(id)
    want.set(id, [verdict, to])
    return id
  }
  // Every push within a fortnight: the Worker blanks the text of pushes older than 30 days.
  await old(
    'redate',
    '2027-10-27',
    'Viene un recibo',
    'El 2027-10-27 se cargará el recibo de 41,07 EUR emitido por AGUA EJEMPLO',
    '2027-10-25T21:40:00+02:00',
  )
  await old(
    'redate',
    '2027-10-27',
    'Upcoming bill',
    'On 27/10/2027 the bill from Power Example of 1.250,00 EUR will be charged',
    '2027-10-26T23:55:00+02:00',
  )
  await old(
    'redate',
    '2027-11-01',
    'Aviso',
    'Se cargará 9,99 EUR el 1 de noviembre por Musica Ejemplo',
    '2027-10-30T20:00:00+02:00',
  )
  // 00:30 in Madrid on 31 October is the 30th in UTC: 10 November is 10 days from the phone's day, 11 from the UTC day.
  await old('redate', '2027-11-10', 'Aviso de cargo', 'Cargo de 3,05 EUR el 10/11/2027', '2027-10-31T00:30:00+02:00')
  await old('no-date', null, 'Compra', 'Compra de 12,00 EUR en Tienda Ejemplo', '2027-10-27T10:00:00+02:00')
  await old('no-date', null, 'Recibo', 'Recibo de 80,00 EUR el 30/12/2027', '2027-10-27T09:00:00+02:00')
  // Two days named: the Worker kept the arrival. The cut leaves only the first, which alone would date it.
  const filler = ' detalle'.repeat(70)
  await old(
    'cut',
    null,
    'Recibo',
    `El 2027-10-30 se cargará 15,00 EUR${filler} o el 31 de octubre`,
    '2027-10-28T11:00:00+02:00',
  )
  // The title names the 29th and the body the 30th: the slot from the title disagrees.
  await old('needs-a-look', null, 'Recibo 2027-10-29', 'Se cargará 7,77 EUR el 30/10', '2027-10-28T12:00:00+02:00')
  const dated = await push(
    'Upcoming bill',
    'On 2027-11-02 the bill of 63,10 EUR will be charged',
    '2027-10-28T13:00:00+02:00',
  )
  want.set(dated, ['already-dated', null])
  const grouped = await old(
    'redate',
    '2027-11-04',
    'Viene un recibo',
    'El 2027-11-04 se cargará 22,22 EUR',
    '2027-11-02T08:00:00+01:00',
  )
  expect(await push('Movimiento', 'Movimiento de -22,22 EUR en tu cuenta', '2027-11-02T08:01:00+01:00')).toBe(grouped)
  const added = await old(
    'decided',
    null,
    'Viene un recibo',
    'El 2027-11-12 se cargará 30,00 EUR',
    '2027-11-10T20:00:00+01:00',
  )
  expect(
    (await submitRecommendation(captures(), expenses(), OWNER, added, entry('2027-11-10', 3000), NOW, true)).ok,
  ).toBe(true)
  const linked = await old(
    'decided',
    null,
    'Viene un recibo',
    'El 2027-11-13 se cargará 31,00 EUR',
    '2027-11-11T20:00:00+01:00',
  )
  const typed = await createTransaction(expenses(), OWNER, entry('2027-11-13', 3100))
  expect((await linkRecommendation(captures(), expenses(), OWNER, linked, typed.id, NOW)).ok).toBe(true)
  const dismissed = await old(
    'decided',
    null,
    'Viene un recibo',
    'El 2027-11-14 se cargará 32,00 EUR',
    '2027-11-11T21:00:00+01:00',
  )
  expect((await dismissRecommendation(captures(), OWNER, dismissed, NOW)).ok).toBe(true)
  // A decided payment whose words are put back: left alone by its state, not only because its text is gone.
  db.prepare("UPDATE capture_events SET body = 'El 2027-11-12 se cargará 30,00 EUR' WHERE rec_id = ?").run(added)
  return want
}

describe('planRedate over pushes the Worker stored', () => {
  it('gives each payment its verdict, and the write changes exactly the rows the plan lists', async () => {
    const want = await seed()
    const plan = planRedate(rows())
    expect(new Map(plan.entries.map((e) => [e.id, [e.verdict, e.to]]))).toEqual(want)

    const before = snapshot()
    const changes = run(plan.apply)
    const moved = plan.entries.filter((e) => e.verdict === 'redate')
    expect(changes).toEqual(moved.map(() => 1))
    for (const e of plan.entries) expect(dayOf(e.id)).toBe(e.to ?? e.from)

    const after = snapshot()
    for (const table of Object.keys(before).filter((t) => t !== 'recommendations'))
      expect(after[table], table).toEqual(before[table])
    const withoutDay = (rows: string[]) =>
      rows
        .map((r) => ({ ...(JSON.parse(r) as object), local_date: undefined }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    expect(withoutDay(after.recommendations!)).toEqual(withoutDay(before.recommendations!))
  })

  it('plans nothing on a second run, and a second apply changes nothing', async () => {
    await seed()
    const plan = planRedate(rows())
    run(plan.apply)
    expect(planRedate(rows()).entries.filter((e) => e.verdict === 'redate')).toEqual([])
    expect(run(plan.apply).every((n) => n === 0)).toBe(true)
  })

  it('changes nothing for a payment decided between the plan and the write', async () => {
    await seed()
    const plan = planRedate(rows())
    const first = plan.entries.find((e) => e.verdict === 'redate')!
    expect((await dismissRecommendation(captures(), OWNER, first.id, NOW)).ok).toBe(true)
    const changes = run(plan.apply)
    expect(changes.filter((n) => n === 0)).toHaveLength(1)
    expect(dayOf(first.id)).toBe(first.from)
  })

  it('takes every row back with the undo, leaving every table as it was', async () => {
    await seed()
    const before = snapshot()
    const plan = planRedate(rows())
    run(plan.apply)
    expect(run(plan.undo).every((n) => n === 1)).toBe(true)
    expect(snapshot()).toEqual(before)
  })

  it('keeps no message text in what it writes down', async () => {
    await seed()
    const plan = planRedate(rows())
    const written = JSON.stringify(plan.entries) + plan.apply + plan.undo
    for (const word of ['AGUA', 'Power', 'Musica', 'Tienda', 'recibo', 'cargará', 'detalle'])
      expect(written).not.toContain(word)
  })
})
