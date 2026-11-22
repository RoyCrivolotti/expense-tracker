/** How long a push's text lives: until its recommendation is decided, and never past `BODY_KEEP_DAYS`. */
import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { migratedDatabase, sqliteD1 } from '../../../src/testing/sqliteD1'
import type { CaptureEvent, CaptureRecorded, CaptureRepository } from '../../../src/domain/ports/captureRepository'
import { createD1CaptureRepository } from '../adapters/d1CaptureRepository'

const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'
const DAY = '2026-03-02'
const at = (day: string) => `${day}T09:00:00.000Z`
const BODY = 'You paid 12,50 EUR at Example Cafe'

let db: DatabaseSync
let repo: CaptureRepository

beforeEach(async () => {
  db = migratedDatabase()
  repo = createD1CaptureRepository({ DB: sqliteD1(db) })
  for (const [keyId, owner] of [
    ['k1', ALICE],
    ['kb', BOB],
  ] as const) {
    await repo.createKey({ keyId, owner, label: 'Phone', secretHash: 'h', createdAt: at(DAY) })
  }
})

function store(
  id: string,
  receivedDay: string,
  over: Partial<CaptureEvent> = {},
): Promise<CaptureRecorded> {
  const receivedAt = at(receivedDay)
  return repo.recordCapture(
    {
      id,
      keyId: 'k1',
      source: 'iberia',
      replayKey: `r-${id}`,
      kind: 'push',
      amountCents: 1250,
      currency: 'EUR',
      merchantRaw: BODY,
      last4: null,
      accountDigits: null,
      occurredAt: receivedAt,
      localDate: receivedDay,
      offsetMinutes: 0,
      receivedAt,
      body: BODY,
      shapeId: 'one-wording',
      ...over,
    },
    {
      id: `rec-${id}`,
      accountId: null,
      amountCents: 1250,
      currency: 'EUR',
      occurredAt: receivedAt,
      localDate: receivedDay,
      merchantRaw: BODY,
      descriptionSuggested: null,
      suggestedType: 'expense',
      createdAt: receivedAt,
    },
  )
}

type TextRow = { id: string; body: string | null; merchant_raw: string | null }
/** Each event's text: null only once both the body and the event's copy of the description are blank. */
const bodies = () =>
  Object.fromEntries(
    (db.prepare('SELECT id, body, merchant_raw FROM capture_events ORDER BY id').all() as TextRow[]).map((r) => [
      r.id,
      r.body ?? r.merchant_raw,
    ]),
  )
const descriptions = () =>
  db
    .prepare('SELECT merchant_raw FROM recommendations')
    .all()
    .map((r) => r.merchant_raw)

describe('deciding a recommendation', () => {
  it.each([
    ['submitting', { state: 'submitted', txnId: 7, at: at(DAY) }],
    ['dismissing', { state: 'dismissed', at: at(DAY) }],
  ] as const)('blanks the text of its push on %s, and only of that push', async (_name, decision) => {
    await store('e1', DAY)
    await store('e2', DAY)
    expect(await repo.decideRecommendation(ALICE, 'rec-e1', decision)).toBe(true)
    expect(bodies()).toEqual({ e1: null, e2: BODY })
    expect(descriptions()).toEqual([BODY, BODY])
  })

  it('blanks the column an older Worker wrote too', async () => {
    await store('e1', DAY)
    db.prepare("UPDATE capture_events SET body_excerpt = 'older text' WHERE id = 'e1'").run()
    await repo.decideRecommendation(ALICE, 'rec-e1', { state: 'dismissed', at: at(DAY) })
    expect(db.prepare('SELECT body, body_excerpt FROM capture_events').all()).toEqual([
      { body: null, body_excerpt: null },
    ])
  })

  it('touches nothing of another person’s, and still acts once', async () => {
    await store('e1', DAY)
    expect(await repo.decideRecommendation(BOB, 'rec-e1', { state: 'dismissed', at: at(DAY) })).toBe(false)
    expect(bodies()).toEqual({ e1: BODY })
    expect(await repo.decideRecommendation(ALICE, 'rec-e1', { state: 'dismissed', at: at(DAY) })).toBe(true)
    expect(await repo.decideRecommendation(ALICE, 'rec-e1', { state: 'dismissed', at: at(DAY) })).toBe(false)
  })
})

describe('the 30-day rule', () => {
  it('blanks text that arrived more than 30 days before a new push, and keeps younger text', async () => {
    await store('old', '2026-01-01')
    await store('days45', '2026-01-17')
    await store('edge', '2026-02-01')
    await store('young', '2026-02-20')
    await store('new', '2026-03-03')
    expect(bodies()).toEqual({ days45: null, edge: BODY, new: BODY, old: null, young: BODY })
    expect(descriptions()).toEqual([BODY, BODY, BODY, BODY, BODY])
  })

  it('blanks the description an older Worker kept on the event with no body', async () => {
    await store('older', '2026-01-01', { body: null })
    await store('new', '2026-03-03')
    expect(bodies()).toEqual({ new: BODY, older: null })
  })

  it('runs on a replay too, though the replay stores nothing', async () => {
    await store('old', '2026-01-01', { replayKey: 'same' })
    expect(await store('again', '2026-03-03', { replayKey: 'same' })).toBe(false)
    expect(bodies()).toEqual({ old: null })
  })

  it('leaves another person’s text alone', async () => {
    await store('bobs', '2026-01-01', { keyId: 'kb' })
    await store('new', '2026-03-03')
    expect(bodies()).toEqual({ bobs: BODY, new: BODY })
  })
})
