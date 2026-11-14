import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { createD1AccessRepository } from '../../../functions/_shared/adapters/d1AccessRepository'
import { createD1CaptureRepository } from '../../../functions/_shared/adapters/d1CaptureRepository'
import { MAX_SOURCES_PER_OWNER, mintCaptureKey } from '../../../src/domain/capture'
import type { MintedCaptureKey } from '../../../src/domain/capture'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import type { SqliteD1Stats } from '../../../src/testing/sqliteD1'
import type { CaptureEnv } from './env'
import { handleCapture } from './handle'
import worker from './index'

const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'
const NOW = new Date('2026-11-03T08:45:00.000Z')
const URL_OF = 'https://capture.example.test/capture'
const PURCHASE = { source: 'iberia', title: 'Compra realizada', body: 'Shop Example *4321 33,40 EUR', date: '2026-11-03T09:41:07+01:00' }

let db: DatabaseSync
let stats: SqliteD1Stats
let env: CaptureEnv
let minted: MintedCaptureKey
let bobKey: MintedCaptureKey

function repos() {
  return { captures: createD1CaptureRepository(env), access: createD1AccessRepository(env) }
}

async function addKey(owner: string): Promise<MintedCaptureKey> {
  const key = await mintCaptureKey()
  await repos().captures.createKey({ keyId: key.keyId, owner, label: 'Phone', secretHash: key.secretHash, createdAt: NOW.toISOString() })
  return key
}

beforeEach(async () => {
  db = migratedDatabase()
  stats = newStats()
  env = { DB: sqliteD1(db, stats), OWNER_EMAIL: ALICE, CAPTURE_REPLAY_SECRET: 'replay-secret' }
  const { access } = repos()
  await access.grantAccess(ALICE, ALICE)
  await access.grantAccess(BOB, ALICE)
  await access.grantGroup(BOB, 'expenses', ALICE)
  minted = await addKey(ALICE)
  bobKey = await addKey(BOB)
  stats.statements = 0
})

function request(over: { key?: string | null; headers?: Record<string, string>; body?: unknown; method?: string; url?: string } = {}) {
  const headers = new Headers({ 'content-type': 'application/json', ...over.headers })
  const key = over.key === undefined ? minted.key : over.key
  if (key !== null && !headers.has('authorization')) headers.set('authorization', `Bearer ${key}`)
  const body = over.body === undefined ? PURCHASE : over.body
  const init: RequestInit = { method: over.method ?? 'POST', headers }
  if ((over.method ?? 'POST') !== 'GET') init.body = typeof body === 'string' ? body : JSON.stringify(body)
  return new Request(over.url ?? URL_OF, init)
}

const send = (req: Request, now = NOW) => handleCapture(req, env, { ...repos(), now: () => now })
const rows = (sql: string) => db.prepare(sql).all() as Array<Record<string, unknown>>
const count = (table: string) => (rows(`SELECT COUNT(*) AS n FROM ${table}`)[0] as { n: number }).n
const shape = async (res: Response) => JSON.stringify([res.status, await res.text(), [...res.headers].sort()])
const pushAt = (minute: number) => ({ ...PURCHASE, date: `2026-11-03T09:${String(minute % 60).padStart(2, '0')}:${String(Math.floor(minute / 60)).padStart(2, '0')}+01:00` })

describe('a valid push', () => {
  it('stores the event and an open recommendation under the key owner', async () => {
    const res = await send(request())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(rows('SELECT owner, key_id, kind, amount_cents, currency, local_date, offset_minutes, last4, merchant_raw FROM capture_events')).toEqual([
      { owner: ALICE, key_id: minted.keyId, kind: 'card-purchase', amount_cents: -3340, currency: 'EUR', local_date: '2026-11-03', offset_minutes: 60, last4: '4321', merchant_raw: 'Shop Example *4321 33,40 EUR' },
    ])
    const [rec] = rows('SELECT owner, amount_cents, suggested_type, state, account_id FROM recommendations')
    expect(rec).toEqual({ owner: ALICE, amount_cents: 3340, suggested_type: 'expense', state: 'open', account_id: null })
    // The recommendation keeps the phone's own clock, the event the UTC instant.
    expect(rows('SELECT occurred_at FROM recommendations')[0]?.occurred_at).toBe('2026-11-03T09:41:07+01:00')
    expect(rows('SELECT occurred_at FROM capture_events')[0]?.occurred_at).toBe('2026-11-03T08:41:07.000Z')
    expect(rows('SELECT last_used_at FROM capture_keys WHERE key_id = ?'.replace('?', `'${minted.keyId}'`))[0]?.last_used_at).toBe(NOW.toISOString())
  })

  it('points the recommendation at the account its card is mapped to', async () => {
    await repos().captures.saveCard(ALICE, { source: 'iberia', digitsKind: 'card', digits: '4321', accountId: 7 })
    await send(request())
    expect(rows('SELECT account_id FROM recommendations')[0]?.account_id).toBe(7)
  })

  it('keeps the body only as an excerpt, and no amount, when none could be read', async () => {
    await send(request({ body: { ...PURCHASE, body: 'Shop Example *4321 sin importe' } }))
    expect(rows('SELECT amount_cents, currency, body_excerpt FROM capture_events')).toEqual([
      { amount_cents: null, currency: null, body_excerpt: 'Shop Example *4321 sin importe' },
    ])
    expect(rows('SELECT amount_cents FROM recommendations')[0]?.amount_cents).toBeNull()
  })

  it('answers the same push twice with an identical 200 and stores it once', async () => {
    const first = await send(request())
    const second = await send(request())
    expect(await shape(second)).toBe(await shape(first))
    expect(count('capture_events')).toBe(1)
    expect(count('recommendations')).toBe(1)
    await send(request({ body: { ...PURCHASE, date: '2026-11-03T09:41:08+01:00' } }))
    expect(count('capture_events')).toBe(2)
  })

  it('stores a keyed hash of the push, not the plain digest', async () => {
    await send(request())
    const stored = rows('SELECT replay_key FROM capture_events')[0]?.replay_key
    const { replayKey } = await import('../../../src/domain/capture')
    expect(stored).toMatch(/^[0-9a-f]{64}$/)
    expect(stored).not.toBe(await replayKey(PURCHASE as never))
  })
})

describe('refusing a request before the database', () => {
  it.each([
    ['GET', 'GET'],
    ['PUT', 'PUT'],
    ['DELETE', 'DELETE'],
  ])('answers 405 to %s', async (_n, method) => {
    const res = await send(request({ method }))
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST')
    expect(stats.statements).toBe(0)
  })

  it.each(['https://x.test/capture/', 'https://x.test/capture/x', 'https://x.test/%63apture', 'https://x.test/api/capture', 'https://x.test/', 'https://x.test/captures'])(
    'answers 404 to %s',
    async (url) => {
      expect((await send(request({ url }))).status).toBe(404)
      expect(stats.statements).toBe(0)
      expect(count('capture_events')).toBe(0)
    },
  )

  it('ignores the query string', async () => {
    expect((await send(request({ url: `${URL_OF}?x=1` }))).status).toBe(200)
  })

  it('answers 413 for a declared size over the cap without reading the body', async () => {
    const res = await send(request({ headers: { 'content-length': '16385' } }))
    expect(res.status).toBe(413)
    expect(stats.statements).toBe(0)
  })

  it('stops reading a chunked body at the cap', async () => {
    let pulled = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++
        controller.enqueue(new Uint8Array(8 * 1024).fill(97))
        if (pulled > 50) controller.close()
      },
    })
    const req = new Request(URL_OF, { method: 'POST', body: stream, headers: { authorization: `Bearer ${minted.key}`, 'content-type': 'application/json' }, duplex: 'half' } as RequestInit)
    expect((await send(req)).status).toBe(413)
    expect(pulled).toBeLessThan(6)
    expect(count('capture_events')).toBe(0)
  })

  it.each(['text/plain', 'application/x-www-form-urlencoded', ''])('answers 415 to content type %j', async (type) => {
    const res = await send(request({ headers: { 'content-type': type } }))
    expect(res.status).toBe(415)
    expect(stats.statements).toBe(0)
  })

  it('accepts a charset on the content type', async () => {
    expect((await send(request({ headers: { 'content-type': 'application/json; charset=utf-8' } }))).status).toBe(200)
  })

  it('refuses every request, touching nothing, while the replay secret is unset', async () => {
    delete env.CAPTURE_REPLAY_SECRET
    const res = await send(request())
    expect(res.status).toBe(503)
    expect(stats.statements).toBe(0)
  })
})

describe('the key', () => {
  const secretOf = (key: MintedCaptureKey) => key.secret
  async function causes(): Promise<Array<[string, Request]>> {
    const revoked = await addKey(ALICE)
    await repos().captures.revokeKey(ALICE, revoked.keyId, NOW.toISOString())
    const unknownId = `xpk_${'a'.repeat(16)}_${secretOf(minted)}`
    const wrongSecret = `xpk_${minted.keyId}_${'b'.repeat(64)}`
    const twice = request({ key: null })
    twice.headers.append('authorization', `Bearer ${minted.key}`)
    twice.headers.append('authorization', `Bearer ${minted.key}`)
    const removed = await addKey('carol@example.com')
    return [
      ['no header', request({ key: null })],
      ['wrong scheme', request({ headers: { authorization: `Basic ${minted.key}` } })],
      ['two headers', twice],
      ['malformed', request({ key: 'xpk_nope' })],
      ['unknown id', request({ key: unknownId })],
      ['wrong secret', request({ key: wrongSecret })],
      ['revoked', request({ key: revoked.key })],
      ['owner not on the allow-list', request({ key: removed.key })],
      ['a login cookie and a forged Access header, no key', request({ key: null, headers: { cookie: 'CF_Authorization=x', 'cf-access-authenticated-user-email': ALICE, 'cf-access-jwt-assertion': 'x.y.z' } })],
    ]
  }

  it('gets one generic 401, byte for byte, whatever is wrong with it', async () => {
    const answers = await Promise.all((await causes()).map(async ([, req]) => shape(await send(req))))
    expect(new Set(answers).size).toBe(1)
    expect(JSON.parse(answers[0] as string)[0]).toBe(401)
    expect(count('capture_events')).toBe(0)
  })

  it('makes no database call for a malformed key and one read for a well-formed bad one', async () => {
    await send(request({ key: 'xpk_nope' }))
    expect(stats.statements).toBe(0)
    await send(request({ key: `xpk_${'c'.repeat(16)}_${'d'.repeat(64)}` }))
    expect(stats.statements).toBe(1)
  })

  it('writes nothing for a flood of wrong keys, and reads at most once each', async () => {
    for (let i = 0; i < 1000; i++) await send(request({ key: `xpk_${i.toString(16).padStart(16, '0')}_${'e'.repeat(64)}` }))
    expect(stats.statements).toBe(1000)
    expect(count('capture_events') + count('capture_counters')).toBe(0)
  })

  it.each([
    ['its owner is removed from the allow-list', () => repos().access.revokeAccess(BOB)],
    ['its owner loses the Expenses group', () => repos().access.revokeGroup(BOB, 'expenses')],
  ])('stops working when %s', async (_name, change) => {
    expect((await send(request({ key: bobKey.key }))).status).toBe(200)
    await change()
    expect((await send(request({ key: bobKey.key, body: { ...PURCHASE, date: '2026-11-03T09:50:00+01:00' } }))).status).toBe(401)
  })

  it('does not come back for an owner who is purged and approved again', async () => {
    const { purgeOwnerData } = await import('../../../functions/_shared/ownerDataPurge')
    await purgeOwnerData(env as never, BOB)
    await repos().access.grantAccess(BOB, ALICE)
    await repos().access.grantGroup(BOB, 'expenses', ALICE)
    expect((await send(request({ key: bobKey.key }))).status).toBe(401)
  })

  it('is refused for the owner when OWNER_EMAIL is unset and no Expenses grant exists', async () => {
    delete env.OWNER_EMAIL
    expect((await send(request())).status).toBe(401)
    expect(count('capture_events')).toBe(0)
  })

  it('files the push under the key owner, whatever Access headers say', async () => {
    const res = await send(request({ headers: { 'cf-access-authenticated-user-email': BOB } }))
    expect(res.status).toBe(200)
    expect(rows('SELECT owner FROM capture_events')).toEqual([{ owner: ALICE }])
    expect(rows('SELECT owner FROM recommendations')).toEqual([{ owner: ALICE }])
  })
})

describe('a body that is not a push', () => {
  it.each([
    ['empty', ''],
    ['not JSON', '{nope'],
    ['an array', '[]'],
    ['a number', '3'],
    ['no source', { ...PURCHASE, source: undefined }],
    ['a source that is not text', { ...PURCHASE, source: 5 }],
    ['an empty source', { ...PURCHASE, source: '' }],
    ['a source over 32 characters', { ...PURCHASE, source: 'a'.repeat(33) }],
    ['an uppercase source', { ...PURCHASE, source: 'Iberia' }],
    ['a source with a space', { ...PURCHASE, source: 'my bank' }],
    ['a source with a trailing newline', { ...PURCHASE, source: 'iberia\n' }],
    ['a source with accents', { ...PURCHASE, source: 'bañco' }],
    ['a source that looks like a path', { ...PURCHASE, source: '../iberia' }],
    ['a source that looks like SQL', { ...PURCHASE, source: "x'; DROP TABLE capture_events;--" }],
    ['a title that is not text', { ...PURCHASE, title: 5 }],
    ['a title over 200 characters', { ...PURCHASE, title: 'a'.repeat(201) }],
    ['a body over 4000 characters', { ...PURCHASE, body: 'a'.repeat(4001) }],
    ['a date that is not text', { ...PURCHASE, date: 5 }],
    ['a date over 64 characters', { ...PURCHASE, date: '2'.repeat(65) }],
  ])('answers 400 for %s', async (_name, body) => {
    const res = await send(request({ body }))
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('{"error":"bad request"}')
    expect(count('capture_events')).toBe(0)
  })
})

describe('a source word with no row in the kind list', () => {
  const push = (source: string) => ({ source, title: 'Compra realizada', body: 'invented text', date: PURCHASE.date })

  it('is accepted and only counted, whatever the title says', async () => {
    expect((await send(request({ body: push('some-bank-2') }))).status).toBe(200)
    expect(rows('SELECT source, received, unrecognised FROM capture_counters')).toEqual([
      { source: 'some-bank-2', received: 1, unrecognised: 1 },
    ])
    expect(count('capture_events') + count('recommendations')).toBe(0)
  })

  it('still reads the Iberia purchase as before', async () => {
    expect((await send(request())).status).toBe(200)
    expect(count('capture_events')).toBe(1)
    expect(count('recommendations')).toBe(1)
  })

  it('accepts a source of exactly 32 characters and refuses 33', async () => {
    expect((await send(request({ body: push('a'.repeat(32)) }))).status).toBe(200)
    expect((await send(request({ body: push('a'.repeat(33)) }))).status).toBe(400)
  })
})

describe('the distinct-source cap', () => {
  const push = (source: string) => ({ source, title: 'Promo', body: 'x', date: PURCHASE.date })
  const words = Array.from({ length: MAX_SOURCES_PER_OWNER }, (_, i) => `bank-${i}`)

  it('refuses a new source once a person has 8, with the 429 the other caps give', async () => {
    for (const word of words) expect((await send(request({ body: push(word) }))).status).toBe(200)
    const over = await send(request({ body: push('bank-new') }))
    expect(over.status).toBe(429)
    expect(over.headers.get('retry-after')).toBe('3600')
    expect(count('capture_counters')).toBe(MAX_SOURCES_PER_OWNER)
  })

  it('still counts a source the person already has, and the next day too', async () => {
    for (const word of words) await send(request({ body: push(word) }))
    expect((await send(request({ body: push('bank-0') }))).status).toBe(200)
    const tomorrow = new Date(NOW.getTime() + 24 * 60 * 60 * 1000)
    expect((await send(request({ body: push('bank-3') }), tomorrow)).status).toBe(200)
    expect((await send(request({ body: push('bank-new') }), tomorrow)).status).toBe(429)
  })

  it('is counted per person', async () => {
    for (const word of words) await send(request({ body: push(word) }))
    expect((await send(request({ key: bobKey.key, body: push('bank-new') }))).status).toBe(200)
  })

  it('never admits more than the cap when new sources arrive at once', async () => {
    const answers = await Promise.all(Array.from({ length: 15 }, (_, i) => send(request({ body: push(`race-${i}`) }))))
    expect(answers.filter((a) => a.status === 200)).toHaveLength(MAX_SOURCES_PER_OWNER)
    expect(count('capture_counters')).toBe(MAX_SOURCES_PER_OWNER)
  })
})

describe('a push the app does not recognise', () => {
  const MARKER = 'ZZMARKERZZ'

  it('adds to the counter and keeps nothing else', async () => {
    const dropped = [
      { source: 'iberia', title: `Promo ${MARKER}`, body: `Oferta ${MARKER}`, date: PURCHASE.date },
      { source: 'santander', title: 'BIZUM recibido', body: `Has recibido 10.0 EUR de ${MARKER} Persona`, date: PURCHASE.date },
      { source: 'santander', title: 'Operacion', body: `Cajero a nombre de ${MARKER}`, date: PURCHASE.date },
      { ...PURCHASE, date: '2030-01-01T00:00:00+01:00' },
    ]
    for (const body of dropped) expect((await send(request({ body }))).status).toBe(200)
    expect(rows('SELECT source, received, unrecognised FROM capture_counters ORDER BY source')).toEqual([
      { source: 'iberia', received: 2, unrecognised: 2 },
      { source: 'santander', received: 2, unrecognised: 2 },
    ])
    expect(count('capture_events') + count('recommendations')).toBe(0)
    expect(everyText()).not.toContain(MARKER)
  })

  it('keeps a recognised purchase\'s text, and never a key or secret', async () => {
    await send(request({ body: { ...PURCHASE, body: `Shop ${MARKER} *4321 33,40 EUR` } }))
    expect(everyText().filter((t) => t.includes(MARKER)).length).toBeGreaterThan(0)
    expect(everyText().some((t) => /xpk_|secret/i.test(t))).toBe(false)
  })

  function everyText(): string[] {
    const tables = rows("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'capture_%' OR name = 'recommendations'") as Array<{ name: string }>
    return tables.flatMap(({ name }) => rows(`SELECT * FROM ${name}`).flatMap((row) => Object.values(row).filter((v): v is string => typeof v === 'string')))
  }
})

describe('hostile text', () => {
  it('is stored cleaned of control and bidi characters, capped, and never logged', async () => {
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined))
    const evil = `<script>x</script>‮\u0000=SUM(A1) ${'y'.repeat(300)} *4321 33,40 EUR`
    await send(request({ body: { ...PURCHASE, body: evil } }))
    await send(request({ body: '{"title": "HOSTILE-MARKER' }))
    const stored = rows('SELECT merchant_raw FROM capture_events')[0]?.merchant_raw as string
    expect(stored.startsWith('<script>x</script>=SUM(A1)')).toBe(true)
    expect(stored.includes(String.fromCharCode(0x202e)) || stored.includes(String.fromCharCode(0))).toBe(false)
    expect(stored.length).toBeLessThanOrEqual(200)
    expect(spies.flatMap((s) => s.mock.calls).length).toBe(0)
    spies.forEach((s) => s.mockRestore())
  })
})

describe('the caps', () => {
  it('refuses the 21st push in an hour from one key, storing no row', async () => {
    for (let i = 0; i < 20; i++) expect((await send(request({ body: pushAt(i + 1) }))).status).toBe(200)
    const over = await send(request({ body: pushAt(21) }))
    expect(over.status).toBe(429)
    expect(over.headers.get('retry-after')).toBe('3600')
    expect(count('capture_events')).toBe(20)
  })

  it('still answers a replay with 200 once the key is at its cap', async () => {
    for (let i = 0; i < 20; i++) await send(request({ body: pushAt(i + 1) }))
    expect((await send(request({ body: pushAt(1) }))).status).toBe(200)
  })

  it('never stores more than the cap when 50 arrive at once', async () => {
    const answers = await Promise.all(Array.from({ length: 50 }, (_, i) => send(request({ body: pushAt(i + 1) }))))
    expect(count('capture_events')).toBe(20)
    expect(answers.filter((a) => a.status === 429)).toHaveLength(30)
  })

  it('counts a key in the last hour only', async () => {
    for (let i = 0; i < 20; i++) await send(request({ body: pushAt(i + 1) }))
    const later = new Date(NOW.getTime() + 61 * 60 * 1000)
    expect((await send(request({ body: pushAt(30) }), later)).status).toBe(200)
  })

  it('refuses a person more than 200 pushes a day, recognised or not', async () => {
    const promo = (n: number) => ({ source: 'iberia', title: `Promo ${n}`, body: 'x', date: PURCHASE.date })
    for (let i = 0; i < 200; i++) expect((await send(request({ body: promo(i) }))).status).toBe(200)
    expect((await send(request({ body: promo(200) }))).status).toBe(429)
    expect((await send(request({ key: bobKey.key, body: promo(1) }))).status).toBe(200)
    const tomorrow = new Date(NOW.getTime() + 24 * 60 * 60 * 1000)
    expect((await send(request({ body: { ...promo(1), date: '2026-11-04T09:00:00+01:00' } }), tomorrow)).status).toBe(200)
  })

  it('refuses everyone once the day has had 2000 pushes', async () => {
    db.prepare("INSERT INTO capture_counters (owner, source, day, received) VALUES ('crowd@example.com', 'iberia', '2026-11-03', 2000)").run()
    expect((await send(request())).status).toBe(429)
    expect(count('capture_events')).toBe(0)
  })

  it('refuses a person who already holds 2000 open recommendations', async () => {
    db.exec(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 2000)
      INSERT INTO recommendations (id, owner, occurred_at, local_date, created_at)
      SELECT 'r' || i, '${ALICE}', '2026-11-01T00:00:00.000Z', '2026-11-01', '2026-11-01T00:00:00.000Z' FROM n`)
    expect((await send(request())).status).toBe(429)
    expect(count('capture_events')).toBe(0)
    expect((await send(request({ key: bobKey.key }))).status).toBe(200)
  })
})

describe('a key revoked after it was checked', () => {
  it('stores nothing when recordCapture runs for it', async () => {
    await repos().captures.revokeKey(ALICE, minted.keyId, NOW.toISOString())
    const event = {
      id: 'e1', keyId: minted.keyId, source: 'iberia' as const, replayKey: 'r', kind: 'card-purchase' as const,
      amountCents: -100, currency: 'EUR', merchantRaw: null, last4: null, accountDigits: null,
      occurredAt: NOW.toISOString(), localDate: '2026-11-03', offsetMinutes: 60, receivedAt: NOW.toISOString(), bodyExcerpt: null,
    }
    const rec = { id: 'r1', accountId: null, amountCents: 100, currency: 'EUR', occurredAt: event.occurredAt, localDate: '2026-11-03', merchantRaw: null, descriptionSuggested: null, suggestedType: 'expense' as const, createdAt: event.receivedAt }
    expect(await repos().captures.recordCapture(event, rec)).toBe(false)
    expect(count('capture_events') + count('recommendations')).toBe(0)
  })
})

describe('the Worker entry', () => {
  it('fails closed with no database: a malformed key is still 401, a well-formed one a fixed 500', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const none = { ...env, DB: undefined } as unknown as CaptureEnv
    expect((await worker.fetch(request({ key: 'xpk_nope' }), none)).status).toBe(401)
    const res = await worker.fetch(request(), none)
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('{"error":"server error"}')
    error.mockRestore()
  })

  it('answers a database failure with a fixed 500 that carries no push text', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const broken = { ...env, DB: { prepare: () => { throw new Error('boom Shop Example') } } } as unknown as CaptureEnv
    const res = await worker.fetch(request(), broken)
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('{"error":"server error"}')
    expect(error.mock.calls).toEqual([['capture: request failed']])
    error.mockRestore()
  })

  it('serves a push through the real clock and repositories', async () => {
    const res = await worker.fetch(request({ body: { ...PURCHASE, date: new Date().toISOString() } }), env)
    expect(res.status).toBe(200)
    expect(count('capture_events')).toBe(1)
  })
})
