import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { createD1AccessRepository } from '../../../functions/_shared/adapters/d1AccessRepository'
import { createD1CaptureRepository } from '../../../functions/_shared/adapters/d1CaptureRepository'
import { mintCaptureKey } from '../../../src/domain/capture'
import type { MintedCaptureKey } from '../../../src/domain/capture'
import { migratedDatabase, sqliteD1 } from '../../../src/testing/sqliteD1'
import type { CaptureEnv } from './env'
import { handleCapture } from './handle'
import type { CaptureLogLine } from './log'

const ALICE = 'alice@example.com'
const NOW = new Date('2026-11-03T08:45:00.000Z')

let db: DatabaseSync
let env: CaptureEnv
let key: MintedCaptureKey
let lines: CaptureLogLine[]

const repos = () => ({ captures: createD1CaptureRepository(env), access: createD1AccessRepository(env) })

beforeEach(async () => {
  db = migratedDatabase()
  env = { DB: sqliteD1(db), OWNER_EMAIL: ALICE, CAPTURE_REPLAY_SECRET: 'replay-secret' }
  await repos().access.grantAccess(ALICE, ALICE)
  key = await mintCaptureKey()
  await repos().captures.createKey({ keyId: key.keyId, owner: ALICE, label: 'Phone', secretHash: key.secretHash, createdAt: NOW.toISOString() })
  lines = []
})

/** The moment `seconds` after 09:30:00 on the phone's clock (UTC+1). */
const at = (seconds: number) => {
  const d = new Date(Date.UTC(2026, 10, 3, 8, 30, 0) + seconds * 1000)
  return `${d.toISOString().slice(0, 19)}+00:00`
}

type Push = { title: string; body: string; seconds: number }
const payment = (seconds: number, amount = '10,50', shop = 'Shop Example'): Push => ({ title: 'Card payment', body: `${shop} *4321 ${amount} EUR`, seconds })
const alert = (seconds: number, amount = '-10.50'): Push => ({ title: 'Balance changed', body: `A movement of ${amount} EUR on your account **5512`, seconds })
const purchase = (seconds: number, shop: string, amount: string): Push => ({ title: 'Purchase', body: `Purchase at ${shop} of ${amount} EUR`, seconds })

function send(push: Push): Promise<Response> {
  const request = new Request('https://capture.example.test/capture', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key.key}` },
    body: JSON.stringify({ source: 'mybank', title: push.title, body: push.body, date: at(push.seconds) }),
  })
  return handleCapture(request, env, { ...repos(), now: () => NOW, log: (line) => lines.push(line) })
}

const rows = (sql: string) => db.prepare(sql).all() as Array<Record<string, unknown>>
const recs = () => rows('SELECT id, merchant_raw, state FROM recommendations ORDER BY occurred_at')
const events = () => rows('SELECT rec_id, grouped FROM capture_events ORDER BY received_at, rowid')

describe('pushes of one movement', () => {
  it('make one recommendation of a payment and the balance alert of the same amount a few seconds later', async () => {
    expect((await send(payment(0))).status).toBe(200)
    expect((await send(alert(8))).status).toBe(200)
    const [rec] = recs()
    expect(recs()).toHaveLength(1)
    expect(events()).toEqual([
      { rec_id: rec?.id, grouped: 0 },
      { rec_id: rec?.id, grouped: 1 },
    ])
    expect(lines.map((l) => [l.outcome, l.reason])).toEqual([
      ['stored', 'stored'],
      ['stored', 'grouped'],
    ])
  })

  it('join in either order', async () => {
    await send(alert(0))
    await send(payment(30))
    expect(recs()).toHaveLength(1)
    expect(events().map((e) => e.grouped)).toEqual([0, 1])
  })

  it('make one recommendation when they arrive at the same moment', async () => {
    const answers = await Promise.all([send(payment(0)), send(alert(1))])
    expect(answers.map((a) => a.status)).toEqual([200, 200])
    expect(recs()).toHaveLength(1)
    expect(new Set(events().map((e) => e.rec_id)).size).toBe(1)
    expect(events().map((e) => e.grouped).sort()).toEqual([0, 1])
  })

  it('stay two when the same wording comes twice, however close', async () => {
    await send(payment(0))
    await send(payment(5, '10,50', 'Other Example'))
    expect(recs()).toHaveLength(2)
    expect(events().map((e) => e.grouped)).toEqual([0, 0])
  })

  it('join the nearest open recommendation, and the next push of the alert’s wording the other one', async () => {
    await send(payment(0))
    await send(payment(30))
    await send(alert(40))
    await send(alert(45))
    // Two recommendations of one wording and price; each alert joins one, the first the nearer in time.
    const joined = rows(`SELECT r.occurred_at AS at, e.occurred_at AS alert FROM capture_events e
      JOIN recommendations r ON r.id = e.rec_id WHERE e.grouped = 1 ORDER BY e.occurred_at`)
    expect(joined).toEqual([
      { at: at(30), alert: new Date(Date.parse(at(40))).toISOString() },
      { at: at(0), alert: new Date(Date.parse(at(45))).toISOString() },
    ])
    expect(recs()).toHaveLength(2)
  })

  it('stay joined when a joined push is sent again, which makes nothing new', async () => {
    await send(payment(0))
    await send(alert(8))
    expect((await send(alert(8))).status).toBe(200)
    expect(recs()).toHaveLength(1)
    expect(events()).toEqual([
      { rec_id: recs()[0]?.id, grouped: 0 },
      { rec_id: recs()[0]?.id, grouped: 1 },
    ])
    expect(lines.at(-1)).toMatchObject({ outcome: 'replay', reason: 'replay' })
  })

  it('stay two when two pushes of one new wording arrive at the same moment, before either has a template', async () => {
    await Promise.all([send(payment(0)), send(payment(2))])
    expect(recs()).toHaveLength(2)
  })

  it('stay two when the second comes more than two minutes later', async () => {
    await send(payment(0))
    await send(alert(6 * 60 + 30))
    expect(recs()).toHaveLength(2)
  })

  it('join at exactly two minutes', async () => {
    await send(payment(0))
    await send(alert(2 * 60))
    expect(recs()).toHaveLength(1)
  })

  it('stay two for another amount or another currency', async () => {
    await send(payment(0))
    await send(alert(5, '-10.51'))
    await send({ ...alert(6), body: 'A movement of -10.50 USD on your account **5512' })
    expect(recs()).toHaveLength(3)
  })

  it('never join a recommendation the person has decided', async () => {
    await send(payment(0))
    const [rec] = recs()
    expect(await repos().captures.decideRecommendation(ALICE, rec?.id as string, { state: 'dismissed', at: NOW.toISOString() })).toBe(true)
    await send(alert(10))
    expect(recs().map((r) => r.state)).toEqual(['dismissed', 'open'])
    expect(events().map((e) => e.grouped)).toEqual([0, 0])
  })

  it('never join another person’s recommendation', async () => {
    const bob = 'bob@example.com'
    await repos().access.grantAccess(bob, ALICE)
    await repos().access.grantGroup(bob, 'expenses', ALICE)
    await send(payment(0))
    const bobKey = await mintCaptureKey()
    await repos().captures.createKey({ keyId: bobKey.keyId, owner: bob, label: 'Phone', secretHash: bobKey.secretHash, createdAt: NOW.toISOString() })
    key = bobKey
    await send(alert(5))
    expect(rows('SELECT owner FROM recommendations ORDER BY owner').map((r) => r.owner)).toEqual([ALICE, bob])
  })
})

describe('the merchant of a joined recommendation', () => {
  /** Two purchases of one wording at different shops, so the template knows where the shop sits. Other amounts. */
  async function teachPurchaseWording() {
    await send(purchase(-3600, 'Book Place', '7,00'))
    await send(purchase(-3000, 'Garden Centre', '8,00'))
  }

  it('becomes the shop a joining push names, when all the first push gave was its whole body', async () => {
    await teachPurchaseWording()
    await send(payment(0))
    expect(recs().at(-1)?.merchant_raw).toBe('Shop Example *4321 10,50 EUR')
    await send(purchase(20, 'Corner Shop', '10,50'))
    expect(recs()).toHaveLength(3)
    expect(recs().at(-1)?.merchant_raw).toBe('Corner Shop')
  })

  it('stays the shop the first push named', async () => {
    await teachPurchaseWording()
    await send(purchase(0, 'Corner Shop', '10,50'))
    await send(alert(10))
    expect(recs()).toHaveLength(3)
    expect(recs().at(-1)?.merchant_raw).toBe('Corner Shop')
  })

  it('is not replaced by the shop a joining push names, when the first push named one', async () => {
    await teachPurchaseWording()
    await send(payment(-2400, '5,00', 'First Example'))
    await send(payment(-1800, '6,00', 'Second Example'))
    await send(purchase(0, 'Corner Shop', '10,50'))
    await send(payment(10, '10,50', 'Till Example'))
    expect(rows("SELECT merchant_raw FROM capture_events WHERE body LIKE 'Till%'")).toEqual([{ merchant_raw: 'Till' }])
    expect(recs()).toHaveLength(5)
    expect(recs().at(-1)?.merchant_raw).toBe('Corner Shop')
  })

  it('is not replaced by a joining push that only has its whole body', async () => {
    await send(payment(0))
    await send(alert(10))
    expect(recs()[0]?.merchant_raw).toBe('Shop Example *4321 10,50 EUR')
  })
})

describe('the card of a joined recommendation', () => {
  it('is the card the push that made it showed, not the account digits of a balance alert that joined it', async () => {
    await send(payment(0))
    await send(alert(5))
    const [listed] = await repos().captures.listOpenRecommendations(ALICE, 10)
    expect(listed?.card).toEqual({ source: 'mybank', digits: '4321' })
    expect(await repos().captures.listWaitingCards(ALICE)).toEqual([{ source: 'mybank', digits: '4321', count: 1 }])
  })

  it('is not given by linking the digits of a push that joined it', async () => {
    db.prepare("INSERT INTO accounts (id, owner, name, kind, settlement, active) VALUES (7, ?, 'Account', 'debit', 'immediate', 1)").run(ALICE)
    await send(payment(0))
    await send(alert(5))
    expect(await repos().captures.linkCard(ALICE, { source: 'mybank', digitsKind: 'card', digits: '5512', accountId: 7 })).toBe('linked')
    expect(rows('SELECT account_id FROM recommendations')).toEqual([{ account_id: null }])
    expect(await repos().captures.linkCard(ALICE, { source: 'mybank', digitsKind: 'card', digits: '4321', accountId: 7 })).toBe('linked')
    expect(rows('SELECT account_id FROM recommendations')).toEqual([{ account_id: 7 }])
  })
})
