import { describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { createD1AccessRepository } from '../../../functions/_shared/adapters/d1AccessRepository'
import { createD1CaptureRepository } from '../../../functions/_shared/adapters/d1CaptureRepository'
import { createD1ExpenseRepository } from '../../../functions/_shared/adapters/d1ExpenseRepository'
import { merchantKeyOf, mintCaptureKey } from '../../../src/domain/capture'
import { sameBillPairs } from '../../../src/domain/capture/pairs'
import {
  dismissRecommendation,
  listRecommendations,
  submitRecommendation,
} from '../../../src/domain/application/recommendationService'
import { removeTransaction } from '../../../src/domain/application/transactionService'
import { migratedDatabase, sqliteD1 } from '../../../src/testing/sqliteD1'
import type { CaptureEnv } from '../src/env'
import { handleCapture } from '../src/handle'
import { planReopen } from './reopen'
import type { ReopenPlan } from './reopen'
import { reopenRowsSql } from './reopenRows'
import type { ReopenInput } from './reopenRows'

/*
 * Reopening a payment that was added and whose expense was then deleted. The pushes go through the real capture Worker
 * into a migrated database, the add and the delete through the app's own services, and the result is compared with a
 * second database where the current Worker stored the same pushes and nobody decided anything. Wordings, merchants,
 * amounts and owners are invented.
 */

const OWNER = 'robin@example.com'
const TITLE = '🔔 ¡Llega una factura!'
const bill = (
  date: string,
  cents: string,
  company: string,
) =>
  `El ${date} se cobrará la factura de ${cents} EUR de ${company}  en la cuenta **0042. Abre la app para más información`
const COMPANY = 'AGUAS DEL SUR SL'
const FIRST = bill('2027-11-20', '12.00', 'LUZ NORTE')
const TARGET = bill('2027-11-24', '50.00', COMPANY)
const ADDED_AT = new Date('2027-11-19T10:00:00.000Z')
/** A merchant row and a template of something else, which no step may touch. */
const OTHER_MERCHANT = 'panaderia del puerto'

interface World {
  db: DatabaseSync
  env: CaptureEnv
  push(
    title: string,
    body: string,
    at: string,
  ): Promise<string>
}

async function world(): Promise<World> {
  const db = migratedDatabase()
  const env: CaptureEnv = { DB: sqliteD1(db), OWNER_EMAIL: OWNER, CAPTURE_REPLAY_SECRET: 'replay-secret' }
  await createD1AccessRepository(env).grantAccess(OWNER, OWNER)
  const key = await mintCaptureKey()
  await createD1CaptureRepository(env).createKey({
    keyId: key.keyId,
    owner: OWNER,
    label: 'Phone',
    secretHash: key.secretHash,
    createdAt: '2027-01-01T00:00:00.000Z',
  })
  db.exec(
    `INSERT INTO accounts (id, owner, name, kind, settlement, active) VALUES (3, '${OWNER}', 'Main', 'debit', 'immediate', 1)`,
  )
  db.exec(
    `INSERT INTO categories (id, owner, name, monthly_budget_cents, sort_order, active) VALUES (2, '${OWNER}', 'Bills', 0, 1, 1)`,
  )
  db.exec(
    `INSERT INTO capture_merchants (owner, key, amount_cents, description, category_id, type, account_id, votes, last_seen) VALUES ('${OWNER}', '${OTHER_MERCHANT}', -1, 'Bread', 2, 'expense', 3, 4, '2027-10-01T08:00:00.000Z')`,
  )
  db.exec(
    `INSERT INTO capture_templates (owner, template_id, source, title, skeleton, seen, accepts, type, first_seen, last_seen) VALUES ('${OWNER}', 'other-template', 'otherbank', 'Compra', 'Compra <N> <C>', 4, 4, 'expense', '2027-10-01T08:00:00.000Z', '2027-10-01T08:00:00.000Z')`,
  )
  const push = async (
    title: string,
    body: string,
    at: string,
  ) => {
    const request = new Request('https://capture.example.test/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key.key}` },
      body: JSON.stringify({ source: 'mybank', title, body, date: at }),
    })
    const response = await handleCapture(request, env, {
      captures: createD1CaptureRepository(env),
      access: createD1AccessRepository(env),
      now: () => new Date(Date.parse(at) + 60_000),
      log: () => {},
    })
    expect(response.status).toBe(200)
    return (db.prepare('SELECT rec_id FROM capture_events ORDER BY rowid DESC LIMIT 1').get() as { rec_id: string })
      .rec_id
  }
  return { db, env, push }
}

/** The two pushes of one wording: the first names another company, so the second teaches the template where it sits. */
async function stored(
  w: World,
  target = TARGET,
): Promise<{ first: string; target: string }> {
  const first = await w.push(TITLE, FIRST, '2027-11-14T20:00:00+01:00')
  return { first, target: await w.push(TITLE, target, '2027-11-18T19:00:00+01:00') }
}

const entry = (amountCents: number) => ({
  date: '2027-11-18',
  budgetMonth: '2027-11',
  description: 'Water bill',
  accountId: 3,
  categoryId: 2,
  type: 'expense' as const,
  amountCents,
  cancelled: false,
})

/** Stores the target dated by its arrival, as a Worker that did not read message dates did, adds it, and deletes the expense. */
async function addedThenDeleted(
  w: World,
  target = TARGET,
  { deleteExpense = true } = {},
): Promise<{ first: string; target: string; txnId: number }> {
  const ids = await stored(w, target)
  w.db.prepare(`UPDATE recommendations SET local_date = '2027-11-18' WHERE id = ?`).run(ids.target)
  const captures = createD1CaptureRepository(w.env)
  const expenses = createD1ExpenseRepository(w.env)
  const saved = await submitRecommendation(captures, expenses, OWNER, ids.target, entry(5000), ADDED_AT, true)
  if (!saved.ok || !('transaction' in saved)) throw new Error('not added')
  if (deleteExpense) await removeTransaction(expenses, OWNER, saved.transaction.id)
  return { ...ids, txnId: saved.transaction.id }
}

function readRows(
  w: World,
  recId: string,
): ReopenInput {
  const [recs, events, templates, merchants, counted] = reopenRowsSql(recId)
    .split(';\n')
    .map((sql) => w.db.prepare(sql).all())
  return {
    recs,
    events,
    templates,
    merchants,
    transactions: Number((counted?.[0] as { n: number }).n),
  } as unknown as ReopenInput
}

async function plan(
  w: World,
  recId: string,
  text = { title: TITLE, body: TARGET },
): Promise<ReopenPlan> {
  const result = await planReopen(readRows(w, recId), text)
  if (!result.ok) throw new Error(`refused: ${result.refusals.join(', ')}`)
  return result.plan
}

const run = (
  w: World,
  sql: string,
) =>
  sql
    .split(';\n')
    .filter((s) => s.trim() !== '')
    .map((s) => Number(w.db.prepare(s).run().changes))

/** Every table's rows as sorted text, so two moments of one database can be compared. */
function snapshot(w: World): Record<string, string[]> {
  const tables = w.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{
    name: string
  }>
  const rows = (name: string) =>
    (w.db.prepare(`SELECT * FROM "${name}"`).all() as unknown[]).map((r) => JSON.stringify(r)).sort()
  return Object.fromEntries(tables.map(({ name }) => [name, rows(name)]))
}

/** The rows two databases must agree on, without the ids each one generated. */
function capture(w: World): Record<string, unknown[]> {
  const generated = new Set(['id', 'rec_id', 'template_id', 'key_id'])
  const read = (sql: string) =>
    (w.db.prepare(sql).all() as Array<Record<string, unknown>>).map((r) =>
      Object.fromEntries(Object.entries(r).filter(([column]) => !generated.has(column))),
    )
  return {
    recommendations: read('SELECT * FROM recommendations ORDER BY occurred_at'),
    capture_events: read('SELECT * FROM capture_events ORDER BY received_at'),
    capture_templates: read('SELECT * FROM capture_templates ORDER BY first_seen'),
    capture_merchants: read('SELECT * FROM capture_merchants ORDER BY key, amount_cents'),
  }
}

describe('reopening an added payment whose expense was deleted', () => {
  it('leaves the four tables as the current Worker would have stored the pushes, with no decision', async () => {
    const oracle = await world()
    await stored(oracle)
    const fixed = await world()
    const { target } = await addedThenDeleted(fixed)
    expect(capture(fixed)).not.toEqual(capture(oracle))

    const reopen = await plan(fixed, target)
    expect(reopen).toMatchObject({ from: '2027-11-18', to: '2027-11-24' })
    expect(run(fixed, reopen.apply)).toEqual(reopen.expectedChanges)
    expect(reopen.expectedChanges).toEqual([1, 1, 1, 1, 1])
    expect(capture(fixed)).toEqual(capture(oracle))
  })

  it('changes nothing outside the four target rows, and the undo puts every table back', async () => {
    const w = await world()
    const { target } = await addedThenDeleted(w)
    const before = snapshot(w)
    const reopen = await plan(w, target)
    run(w, reopen.apply)
    const after = snapshot(w)
    const moved = Object.keys(before).filter((t) => JSON.stringify(before[t]) !== JSON.stringify(after[t]))
    expect(moved.sort()).toEqual(['capture_events', 'capture_merchants', 'capture_templates', 'recommendations'])
    // Only this add's two merchant rows go, and one row each of the push, its template and the payment changes.
    expect(after.capture_merchants!.map((r) => (JSON.parse(r) as { key: string }).key)).toEqual([OTHER_MERCHANT])
    for (const table of ['capture_events', 'capture_templates', 'recommendations']) {
      const changed = after[table]!.filter((r) => !before[table]!.includes(r))
      expect(changed, table).toHaveLength(1)
      expect(after[table]!.length, table).toBe(before[table]!.length)
    }
    expect(run(w, reopen.undo)).toEqual([1, 1, 1, 1, 1])
    expect(snapshot(w)).toEqual(before)
  })

  it('shows it on the review list again, where a charge six days later pairs with it', async () => {
    const w = await world()
    const { target } = await addedThenDeleted(w)
    run(w, (await plan(w, target)).apply)
    const charge = await w.push(
      'Movimiento',
      'Movimiento de -50,00 EUR en tu cuenta **0042',
      '2027-11-24T06:10:00+01:00',
    )
    const open = (await listRecommendations(createD1CaptureRepository(w.env), OWNER, 50)).recommendations
    expect(open.find((r) => r.id === target)).toMatchObject({ localDate: '2027-11-24', merchantRaw: COMPANY })
    const waiting = open.map((r) => ({
      id: r.id,
      amountCents: r.amountCents ?? 0,
      currency: r.currency,
      suggestedType: r.suggestedType,
      occurredAt: r.occurredAt,
      localDate: r.localDate,
    }))
    expect(sameBillPairs(waiting)).toEqual([{ announcement: target, charge }])
  })

  it('teaches the app once when it is added again', async () => {
    const w = await world()
    const { target } = await addedThenDeleted(w)
    run(w, (await plan(w, target)).apply)
    const captures = createD1CaptureRepository(w.env)
    const again = await submitRecommendation(
      captures,
      createD1ExpenseRepository(w.env),
      OWNER,
      target,
      entry(5000),
      ADDED_AT,
      true,
    )
    expect(again.ok).toBe(true)
    expect(w.db.prepare("SELECT accepts FROM capture_templates WHERE source = 'mybank'").all()).toEqual([
      { accepts: 1 },
    ])
    const votes = 'SELECT amount_cents, votes FROM capture_merchants WHERE key = ? ORDER BY amount_cents'
    expect(w.db.prepare(votes).all(merchantKeyOf(COMPANY))).toEqual([
      { amount_cents: -1, votes: 1 },
      { amount_cents: 5000, votes: 1 },
    ])
  })

  it('stops before the payment shows when the template changed after the plan, and the undo takes back the rest', async () => {
    const w = await world()
    const { target } = await addedThenDeleted(w)
    const reopen = await plan(w, target)
    w.db.prepare("UPDATE capture_templates SET accepts = 2 WHERE source = 'mybank'").run()
    const before = snapshot(w)
    const changes = run(w, reopen.apply)
    expect(changes).toEqual([1, 0, 0, 0, 0])
    expect(changes).not.toEqual(reopen.expectedChanges)
    expect(
      (await listRecommendations(createD1CaptureRepository(w.env), OWNER, 50)).recommendations.map((r) => r.id),
    ).not.toContain(target)
    expect(run(w, reopen.undo)).toEqual([0, 0, 0, 0, 1])
    expect(snapshot(w)).toEqual(before)
  })

  it('leaves the template alone when another of its pushes has an outcome by the time of the write', async () => {
    const w = await world()
    const { first, target } = await addedThenDeleted(w)
    const reopen = await plan(w, target)
    // An outcome with no change to the facts: what a decision whose learning was cut short would leave.
    w.db.prepare("UPDATE capture_events SET outcome = 'dismissed' WHERE rec_id = ?").run(first)
    expect(run(w, reopen.apply)).toEqual([1, 0, 0, 0, 0])
  })

  it('changes nothing when the push’s outcome changed after the plan', async () => {
    const w = await world()
    const { target } = await addedThenDeleted(w)
    const reopen = await plan(w, target)
    w.db.prepare("UPDATE capture_events SET outcome = 'linked' WHERE rec_id = ?").run(target)
    const before = snapshot(w)
    expect(run(w, reopen.apply)).toEqual([0, 0, 0, 0, 0])
    expect(snapshot(w)).toEqual(before)
  })

  it('does not reopen when another add voted for a merchant row after the plan, and the undo leaves that row be', async () => {
    const w = await world()
    const { target } = await addedThenDeleted(w)
    const reopen = await plan(w, target)
    w.db
      .prepare("UPDATE capture_merchants SET votes = 2, last_seen = '2027-11-20T08:00:00.000Z' WHERE amount_cents = -1")
      .run()
    const before = snapshot(w)
    expect(run(w, reopen.apply)).toEqual([1, 1, 0, 1, 0])
    const votes = 'SELECT amount_cents, votes FROM capture_merchants WHERE key = ?'
    expect(w.db.prepare(votes).all(merchantKeyOf(COMPANY))).toEqual([{ amount_cents: -1, votes: 2 }])
    expect(run(w, reopen.undo)).toEqual([0, 0, 1, 1, 1])
    expect(snapshot(w)).toEqual(before)
  })
})

describe('what reopening refuses', () => {
  const refusalsFor = async (
    w: World,
    recId: string,
    text = { title: TITLE, body: TARGET },
  ) => {
    const result = await planReopen(readRows(w, recId), text)
    return result.ok ? [] : result.refusals
  }

  it.each([
    [
      'a title without the emoji',
      '¡Llega una factura!',
      TARGET,
      ['shape-differs', 'slots-differ', 'title-differs', 'name-differs'],
    ],
    ['a changed word', TITLE, TARGET.replace('cuenta', 'tarjeta'), ['shape-differs', 'name-differs']],
    ['another company', TITLE, TARGET.replace('AGUAS', 'GAS'), ['shape-differs', 'name-differs']],
    ['another amount', TITLE, TARGET.replace('50.00', '50.01'), ['slots-differ']],
    ['another date', TITLE, TARGET.replace('2027-11-24', '2027-11-25'), ['slots-differ']],
  ])('refuses words that are not the push’s: %s', async (_name, title, body, refusals) => {
    const w = await world()
    const { target } = await addedThenDeleted(w)
    expect(await refusalsFor(w, target, { title, body })).toEqual(refusals)
  })

  it('accepts the words with other spacing, since the Worker cleans it the same way', async () => {
    const w = await world()
    const { target } = await addedThenDeleted(w)
    expect(await refusalsFor(w, target, { title: TITLE, body: ` ${TARGET.replaceAll(' ', '   ')}\n` })).toEqual([])
  })

  it('refuses while the expense is there, and its first statement changes nothing if it comes back', async () => {
    const w = await world()
    const { target, txnId } = await addedThenDeleted(w, TARGET, { deleteExpense: false })
    expect(await refusalsFor(w, target)).toEqual(['expense-exists'])
    const reopen = await planReopen({ ...readRows(w, target), transactions: 0 }, { title: TITLE, body: TARGET })
    if (!reopen.ok) throw new Error('planned')
    expect(run(w, reopen.plan.apply)).toEqual([0, 0, 0, 0, 0])
    expect(w.db.prepare('SELECT state, txn_id FROM recommendations WHERE id = ?').get(target)).toEqual({
      state: 'submitted',
      txn_id: txnId,
    })
  })

  it('refuses a payment that is open or dismissed, or that does not exist', async () => {
    const w = await world()
    const { first, target } = await stored(w)
    expect(await refusalsFor(w, target)).toContain('not-added')
    await dismissRecommendation(createD1CaptureRepository(w.env), OWNER, first, ADDED_AT)
    expect(await refusalsFor(w, first, { title: TITLE, body: FIRST })).toContain('not-added')
    expect(await refusalsFor(w, 'no-such-id')).toEqual(['not-added'])
  })

  it.each([
    ['names no day', TARGET.replace('El 2027-11-24 se', 'Se')],
    ['names two days', TARGET.replace('Abre la app', 'o el 2027-11-25. Abre la app')],
    ['names a day 12 days ahead', TARGET.replace('2027-11-24', '2027-11-30')],
  ])('refuses words that do not name one day in the window: %s', async (_name, body) => {
    const w = await world()
    const { target } = await addedThenDeleted(w, body)
    expect(await refusalsFor(w, target, { title: TITLE, body })).toEqual(['no-date'])
  })

  it('refuses when another push of the template was decided, so its facts are not only this add’s', async () => {
    const w = await world()
    const { first, target } = await addedThenDeleted(w)
    await dismissRecommendation(createD1CaptureRepository(w.env), OWNER, first, ADDED_AT)
    expect(await refusalsFor(w, target)).toEqual(['template-decided-elsewhere'])
  })

  it('refuses when a merchant row the add wrote to was there before it', async () => {
    const w = await world()
    const key = merchantKeyOf(COMPANY)!
    w.db
      .prepare(
        `INSERT INTO capture_merchants (owner, key, amount_cents, description, category_id, type, account_id, votes, last_seen) VALUES (?, ?, -1, 'Water bill', 2, 'expense', 3, 1, '2027-10-01T00:00:00.000Z')`,
      )
      .run(OWNER, key)
    const { target } = await addedThenDeleted(w)
    expect(await refusalsFor(w, target)).toEqual(['merchant-not-from-this-add'])
  })

  it('refuses a push that still holds its words, has no outcome, joined another, or has no template', async () => {
    const w = await world()
    const { target } = await addedThenDeleted(w)
    const rows = readRows(w, target)
    const event = rows.events[0]!
    const refusals = async (over: Partial<ReopenInput>) =>
      ((await planReopen({ ...rows, ...over }, { title: TITLE, body: TARGET })) as { refusals: string[] }).refusals
    expect(await refusals({ events: [{ ...event, body: 'words' }] })).toEqual(['not-blank'])
    expect(await refusals({ events: [{ ...event, outcome: null }] })).toEqual(['no-outcome'])
    expect(await refusals({ events: [{ ...event, grouped: 1 }] })).toEqual(['not-one-push'])
    expect(await refusals({ events: [event, { ...event, grouped: 1 }] })).toEqual(['not-one-push'])
    expect(await refusals({ templates: [] })).toEqual(['no-template'])
  })
})

describe('a plan gone stale before the write', () => {
  it('changes nothing when the payment changed after the plan', async () => {
    const w = await world()
    const { target } = await addedThenDeleted(w)
    const reopen = await plan(w, target)
    w.db.prepare("UPDATE recommendations SET decided_at = '2027-11-19T11:00:00.000Z' WHERE id = ?").run(target)
    const before = snapshot(w)
    expect(run(w, reopen.apply)).toEqual([0, 0, 0, 0, 0])
    expect(snapshot(w)).toEqual(before)
  })

  it('leaves the template alone when the push’s outcome was cleared by something else', async () => {
    const w = await world()
    const { target } = await addedThenDeleted(w)
    const reopen = await plan(w, target)
    w.db.prepare('UPDATE capture_events SET outcome = NULL WHERE rec_id = ?').run(target)
    const before = snapshot(w)
    expect(run(w, reopen.apply)).toEqual([0, 0, 0, 0, 0])
    expect(snapshot(w)).toEqual(before)
  })

  it('does not reopen a payment with no merchant name when the template changed after the plan', async () => {
    const w = await world()
    // The first push of its wording: its name is the whole message, which teaches no merchant row.
    const target = await w.push(TITLE, TARGET, '2027-11-18T19:00:00+01:00')
    w.db.prepare(`UPDATE recommendations SET local_date = '2027-11-18' WHERE id = ?`).run(target)
    const expenses = createD1ExpenseRepository(w.env)
    const saved = await submitRecommendation(
      createD1CaptureRepository(w.env),
      expenses,
      OWNER,
      target,
      entry(5000),
      ADDED_AT,
      true,
    )
    if (!saved.ok || !('transaction' in saved)) throw new Error('not added')
    await removeTransaction(expenses, OWNER, saved.transaction.id)
    const reopen = await plan(w, target)
    expect(reopen.expectedChanges).toEqual([1, 1, 1])
    w.db.prepare("UPDATE capture_templates SET accepts = 2 WHERE source = 'mybank'").run()
    expect(run(w, reopen.apply)).toEqual([1, 0, 0])
    expect(w.db.prepare('SELECT state FROM recommendations WHERE id = ?').get(target)).toEqual({ state: 'submitted' })
  })
})

describe('an undo run late', () => {
  it.each([
    ['added again with another description', 'add'],
    ['dismissed', 'dismiss'],
  ])('changes nothing once the reopened payment was %s', async (_name, answer) => {
    const w = await world()
    const { target } = await addedThenDeleted(w)
    const reopen = await plan(w, target)
    run(w, reopen.apply)
    const captures = createD1CaptureRepository(w.env)
    if (answer === 'add') {
      const row = { ...entry(5000), description: 'Water' }
      expect(
        (await submitRecommendation(captures, createD1ExpenseRepository(w.env), OWNER, target, row, ADDED_AT, true)).ok,
      ).toBe(true)
    } else {
      expect((await dismissRecommendation(captures, OWNER, target, ADDED_AT)).ok).toBe(true)
    }
    const before = snapshot(w)
    expect(run(w, reopen.undo)).toEqual([0, 0, 0, 0, 0])
    expect(snapshot(w)).toEqual(before)
  })

  it('changes nothing when the apply never ran', async () => {
    const w = await world()
    const { target } = await addedThenDeleted(w)
    const reopen = await plan(w, target)
    const before = snapshot(w)
    expect(run(w, reopen.undo)).toEqual([0, 0, 0, 0, 0])
    expect(snapshot(w)).toEqual(before)
  })
})

describe('what the add taught, as the merchant rows show it', () => {
  const refusalsOf = async (
    w: World,
    recId: string,
  ) => {
    const result = await planReopen(readRows(w, recId), { title: TITLE, body: TARGET })
    return result.ok ? [] : result.refusals
  }

  it('refuses when a row the add inserted was voted for again later', async () => {
    const w = await world()
    const { target } = await addedThenDeleted(w)
    w.db
      .prepare(
        "UPDATE capture_merchants SET votes = 2, last_seen = '2027-11-21T09:00:00.000Z' WHERE key = ? AND amount_cents = -1",
      )
      .run(merchantKeyOf(COMPANY))
    expect(await refusalsOf(w, target)).toEqual(['merchant-not-from-this-add'])
  })

  it('refuses when the payment has a name and no row of it was written by the add', async () => {
    const w = await world()
    const { target } = await addedThenDeleted(w)
    w.db.prepare('DELETE FROM capture_merchants WHERE key = ?').run(merchantKeyOf(COMPANY))
    expect(await refusalsOf(w, target)).toEqual(['merchant-not-from-this-add'])
  })

  it('refuses when a row of another name was written at the same moment', async () => {
    const w = await world()
    const { target } = await addedThenDeleted(w)
    w.db.prepare('UPDATE capture_merchants SET last_seen = ? WHERE key = ?').run(ADDED_AT.toISOString(), OTHER_MERCHANT)
    expect(await refusalsOf(w, target)).toEqual(['merchant-not-from-this-add'])
  })

  it('leaves alone an older row of the same name with another description', async () => {
    const w = await world()
    w.db
      .prepare(
        "INSERT INTO capture_merchants (owner, key, amount_cents, description, category_id, type, account_id, votes, last_seen) VALUES (?, ?, -1, 'Water company', 2, 'expense', 3, 5, '2027-10-02T08:00:00.000Z')",
      )
      .run(OWNER, merchantKeyOf(COMPANY))
    const { target } = await addedThenDeleted(w)
    const reopen = await plan(w, target)
    expect(run(w, reopen.apply)).toEqual([1, 1, 1, 1, 1])
    expect(
      w.db.prepare('SELECT description, votes FROM capture_merchants WHERE key = ?').all(merchantKeyOf(COMPANY)),
    ).toEqual([{ description: 'Water company', votes: 5 }])
  })
})

describe('reopening: the rows the gate reads', () => {
  it('refuses a payment in another state even with an expense id, and a push with an excerpt left', async () => {
    const w = await world()
    const { target } = await addedThenDeleted(w)
    const rows = readRows(w, target)
    const refusals = async (over: Partial<ReopenInput>) =>
      ((await planReopen({ ...rows, ...over }, { title: TITLE, body: TARGET })) as { refusals?: string[] }).refusals
    expect(await refusals({ recs: [{ ...rows.recs[0]!, state: 'dismissed' }] })).toEqual(['not-added'])
    expect(await refusals({ events: [{ ...rows.events[0]!, body_excerpt: 'words' }] })).toEqual(['not-blank'])
  })

  it('measures the window from the push’s arrival, not from the day the payment carries', async () => {
    const w = await world()
    const { target } = await addedThenDeleted(w)
    const rows = readRows(w, target)
    // 24 November is 6 days after the push arrived and 14 after this day, outside the window.
    const result = await planReopen(
      { ...rows, recs: [{ ...rows.recs[0]!, local_date: '2027-11-10' }] },
      { title: TITLE, body: TARGET },
    )
    expect(result.ok && result.plan.to).toBe('2027-11-24')
  })

  it('restores a long message cut where the Worker cuts it, as the Worker would have stored it', async () => {
    const long = TARGET + ' Gracias.'.repeat(60)
    const oracle = await world()
    await stored(oracle, long)
    const fixed = await world()
    const { target } = await addedThenDeleted(fixed, long)
    run(fixed, (await plan(fixed, target, { title: TITLE, body: long })).apply)
    expect(capture(fixed)).toEqual(capture(oracle))
    const body = (fixed.db.prepare('SELECT body FROM capture_events WHERE rec_id = ?').get(target) as { body: string })
      .body
    expect(body).toHaveLength(500)
  })
})
