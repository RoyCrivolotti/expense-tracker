import { beforeEach, describe, expect, it } from 'vitest'
import { migratedDatabase, sqliteD1 } from '../../../src/testing/sqliteD1'
import type { CaptureEvent, CaptureRepository, NewRecommendation } from '../../../src/domain/ports/captureRepository'
import { createD1CaptureRepository } from '../adapters/d1CaptureRepository'

const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'
const T0 = '2026-03-02T09:00:00.000Z'

let repo: CaptureRepository

beforeEach(async () => {
  repo = createD1CaptureRepository({ DB: sqliteD1(migratedDatabase()) })
  // Events are filed under their key's owner, so the keys the events below name must exist.
  await repo.createKey(key('k1'))
  await repo.createKey(key('kb', BOB))
})

const key = (keyId: string, owner = ALICE, createdAt = T0) => ({
  keyId,
  owner,
  label: 'My phone',
  secretHash: `hash-of-${keyId}`,
  createdAt,
})

function event(over: Partial<CaptureEvent> = {}): CaptureEvent {
  return {
    id: 'e1',
    keyId: 'k1',
    source: 'iberia',
    replayKey: 'r1',
    kind: 'card-purchase',
    amountCents: -1250,
    currency: 'EUR',
    merchantRaw: 'CAFE EXAMPLE',
    last4: '0000',
    accountDigits: null,
    occurredAt: '2026-03-02T08:59:00.000Z',
    localDate: '2026-03-02',
    offsetMinutes: 60,
    receivedAt: T0,
    bodyExcerpt: null,
    ...over,
  }
}

function rec(over: Partial<NewRecommendation> = {}): NewRecommendation {
  return {
    id: 'rec-1',
    owner: ALICE,
    accountId: null,
    amountCents: 1250,
    currency: 'EUR',
    occurredAt: '2026-03-02T08:59:00.000Z',
    localDate: '2026-03-02',
    merchantRaw: 'CAFE EXAMPLE',
    descriptionSuggested: null,
    suggestedType: 'expense',
    createdAt: T0,
    ...over,
  }
}

describe('capture keys', () => {
  it('stores a key and finds it by id with its hash, owner and no revocation', async () => {
    expect(await repo.findKey('k1')).toEqual({
      keyId: 'k1',
      owner: ALICE,
      label: 'My phone',
      secretHash: 'hash-of-k1',
      createdAt: T0,
      lastUsedAt: null,
      revokedAt: null,
    })
    expect(await repo.findKey('nope')).toBeNull()
  })

  it('refuses a fourth active key and writes nothing', async () => {
    for (const id of ['k2', 'k3']) expect(await repo.createKey(key(id))).toBe(true)
    expect(await repo.createKey(key('k4'))).toBe(false)
    expect(await repo.findKey('k4')).toBeNull()
  })

  it('counts a revoked key as free and another person’s keys as theirs', async () => {
    for (const id of ['k2', 'k3']) await repo.createKey(key(id))
    expect(await repo.createKey(key('b1', BOB))).toBe(true)
    expect(await repo.revokeKey(ALICE, 'k1', T0)).toBe(true)
    expect(await repo.createKey(key('k4'))).toBe(true)
  })

  it('cannot exceed the limit when requests arrive together', async () => {
    const results = await Promise.all(['k2', 'k3', 'k4', 'k5'].map((id) => repo.createKey(key(id))))
    expect(results.filter(Boolean)).toHaveLength(2)
    expect(await repo.listKeys(ALICE)).toHaveLength(3)
  })

  it('lists active keys newest first and never shows the hash', async () => {
    await repo.createKey(key('k2', ALICE, '2026-03-02T00:00:00.000Z'))
    await repo.createKey(key('k3', ALICE, '2026-03-03T00:00:00.000Z'))
    await repo.revokeKey(ALICE, 'k3', T0)
    const listed = await repo.listKeys(ALICE)
    expect(listed.map((k) => k.keyId)).toEqual(['k1', 'k2'])
    expect(JSON.stringify(listed)).not.toMatch(/hash/i)
  })

  it('revokes only the owner’s own key, once', async () => {
    expect(await repo.revokeKey(BOB, 'k1', T0)).toBe(false)
    expect((await repo.findKey('k1'))?.revokedAt).toBeNull()
    expect(await repo.revokeKey(ALICE, 'k1', T0)).toBe(true)
    expect(await repo.revokeKey(ALICE, 'k1', '2026-03-09T00:00:00.000Z')).toBe(false)
    expect((await repo.findKey('k1'))?.revokedAt).toBe(T0)
  })

  it('records a use at most once a minute, and never on a revoked key', async () => {
    await repo.touchKey('k1', '2026-03-02T10:00:00.000Z')
    await repo.touchKey('k1', '2026-03-02T10:00:30.000Z')
    expect((await repo.findKey('k1'))?.lastUsedAt).toBe('2026-03-02T10:00:00.000Z')
    await repo.touchKey('k1', '2026-03-02T10:01:00.000Z')
    expect((await repo.findKey('k1'))?.lastUsedAt).toBe('2026-03-02T10:01:00.000Z')
    await repo.revokeKey(ALICE, 'k1', T0)
    await repo.touchKey('k1', '2026-03-02T11:00:00.000Z')
    expect((await repo.findKey('k1'))?.lastUsedAt).toBe('2026-03-02T10:01:00.000Z')
  })
})

describe('capture events', () => {
  it('stores a push once: the same push again changes nothing', async () => {
    expect(await repo.recordEvent(event())).toBe(true)
    expect(await repo.recordEvent(event({ id: 'e2' }))).toBe(false)
    expect(await repo.eventsSince('k1', '2026-01-01T00:00:00.000Z')).toBe(1)
  })

  it('treats the same replay key from another source or person as a different push', async () => {
    await repo.recordEvent(event())
    expect(await repo.recordEvent(event({ id: 'e2', source: 'santander' }))).toBe(true)
    expect(await repo.recordEvent(event({ id: 'e3', keyId: 'kb' }))).toBe(true)
  })

  it('counts a key’s pushes since a time', async () => {
    await repo.recordEvent(event({ id: 'e1', replayKey: 'a', receivedAt: '2026-03-02T09:00:00.000Z' }))
    await repo.recordEvent(event({ id: 'e2', replayKey: 'b', receivedAt: '2026-03-02T10:00:00.000Z' }))
    await repo.recordEvent(event({ id: 'e3', replayKey: 'c', keyId: 'other', receivedAt: '2026-03-02T10:00:00.000Z' }))
    expect(await repo.eventsSince('k1', '2026-03-02T09:30:00.000Z')).toBe(1)
    expect(await repo.eventsSince('k1', '2026-03-02T09:00:00.000Z')).toBe(2)
  })

  it('reports the last capture per person and source, or null', async () => {
    expect(await repo.lastCaptureAt(ALICE, 'iberia')).toBeNull()
    await repo.recordEvent(event({ id: 'e1', replayKey: 'a', receivedAt: '2026-03-02T09:00:00.000Z' }))
    await repo.recordEvent(event({ id: 'e2', replayKey: 'b', receivedAt: '2026-03-04T09:00:00.000Z' }))
    await repo.recordEvent(event({ id: 'e3', replayKey: 'c', keyId: 'kb', receivedAt: '2026-03-09T09:00:00.000Z' }))
    expect(await repo.lastCaptureAt(ALICE, 'iberia')).toBe('2026-03-04T09:00:00.000Z')
    expect(await repo.lastCaptureAt(ALICE, 'santander')).toBeNull()
  })

  it('keeps a number per person, source and day for what was dropped, and nothing else', async () => {
    await repo.bumpCounter(ALICE, 'iberia', '2026-03-02', 'unrecognised')
    await repo.bumpCounter(ALICE, 'iberia', '2026-03-02', 'unrecognised')
    await repo.bumpCounter(ALICE, 'iberia', '2026-03-02', 'received')
    await repo.bumpCounter(ALICE, 'iberia', '2026-03-03', 'received')
    await repo.bumpCounter(BOB, 'iberia', '2026-03-02', 'received')
    expect(await repo.readCounters(ALICE, '2026-03-02')).toEqual([
      { source: 'iberia', day: '2026-03-02', received: 1, unrecognised: 2 },
      { source: 'iberia', day: '2026-03-03', received: 1, unrecognised: 0 },
    ])
    expect(await repo.readCounters(ALICE, '2026-03-03')).toHaveLength(1)
  })
})

describe('what an event cannot do', () => {
  it('is filed under the key’s owner, whatever else the caller knows', async () => {
    await repo.recordEvent(event({ keyId: 'kb' }))
    expect(await repo.lastCaptureAt(BOB, 'iberia')).toBe(T0)
    expect(await repo.lastCaptureAt(ALICE, 'iberia')).toBeNull()
  })

  it('is not stored for a key that was revoked or never existed', async () => {
    await repo.revokeKey(ALICE, 'k1', T0)
    expect(await repo.recordEvent(event())).toBe(false)
    expect(await repo.recordEvent(event({ id: 'e2', keyId: 'nope', replayKey: 'r2' }))).toBe(false)
    expect(await repo.eventsSince('k1', '2026-01-01T00:00:00.000Z')).toBe(0)
  })

  it('throws, and does not pose as a replay, when a required field is missing', async () => {
    await expect(repo.recordEvent(event({ localDate: null as unknown as string }))).rejects.toThrow()
    expect(await repo.recordEvent(event())).toBe(true)
  })

  it('throws, and does not pose as a replay, when an id is used twice for different pushes', async () => {
    await repo.recordEvent(event())
    await expect(repo.recordEvent(event({ replayKey: 'another' }))).rejects.toThrow()
    expect(await repo.eventsSince('k1', '2026-01-01T00:00:00.000Z')).toBe(1)
  })

  it('refuses a merchant over 200 characters and an excerpt over 500', async () => {
    await expect(repo.recordEvent(event({ merchantRaw: 'x'.repeat(201) }))).rejects.toThrow()
    await expect(repo.recordEvent(event({ bodyExcerpt: 'x'.repeat(501) }))).rejects.toThrow()
    expect(await repo.recordEvent(event({ merchantRaw: 'x'.repeat(200), bodyExcerpt: 'x'.repeat(500) }))).toBe(true)
  })
})

describe('an event and its recommendation', () => {
  const recFields: Omit<NewRecommendation, 'owner'> = { ...rec(), owner: undefined } as never

  it('are stored together, the recommendation under the key’s owner and named by the event', async () => {
    expect(await repo.recordCapture(event(), recFields)).toBe(true)
    expect(await repo.getRecommendation(ALICE, 'rec-1')).toMatchObject({ state: 'open', amountCents: 1250 })
    expect(await repo.getRecommendation(BOB, 'rec-1')).toBeNull()
  })

  it('make nothing when the push is a replay, however the retry is numbered', async () => {
    await repo.recordCapture(event(), recFields)
    expect(await repo.recordCapture(event({ id: 'e2' }), { ...recFields, id: 'rec-2' })).toBe(false)
    expect(await repo.getRecommendation(ALICE, 'rec-2')).toBeNull()
  })

  it('make nothing for a revoked key', async () => {
    await repo.revokeKey(ALICE, 'k1', T0)
    expect(await repo.recordCapture(event(), recFields)).toBe(false)
    expect(await repo.getRecommendation(ALICE, 'rec-1')).toBeNull()
  })

  it('leave no event behind when the recommendation cannot be written, so the retry is not a replay', async () => {
    await repo.createRecommendation(rec())
    await expect(repo.recordCapture(event(), recFields)).rejects.toThrow()
    expect(await repo.eventsSince('k1', '2026-01-01T00:00:00.000Z')).toBe(0)
    expect(await repo.recordCapture(event(), { ...recFields, id: 'rec-9' })).toBe(true)
  })
})

describe('card map', () => {
  it('maps digits to an account per person and replaces a mapping', async () => {
    await repo.saveCard(ALICE, { source: 'iberia', digitsKind: 'card', digits: '0000', accountId: 4 })
    await repo.saveCard(ALICE, { source: 'iberia', digitsKind: 'card', digits: '0000', accountId: 5 })
    await repo.saveCard(BOB, { source: 'iberia', digitsKind: 'card', digits: '0000', accountId: 9 })
    expect(await repo.listCards(ALICE)).toEqual([
      { source: 'iberia', digitsKind: 'card', digits: '0000', accountId: 5 },
    ])
  })
})

describe('recommendations', () => {
  it('round-trips a recommendation as open and undecided', async () => {
    await repo.createRecommendation(rec())
    expect(await repo.getRecommendation(ALICE, 'rec-1')).toEqual({
      ...rec(),
      state: 'open',
      txnId: null,
      decidedAt: null,
    })
  })

  it('does not show a recommendation to anyone but its owner', async () => {
    await repo.createRecommendation(rec())
    expect(await repo.getRecommendation(BOB, 'rec-1')).toBeNull()
    expect(await repo.listOpenRecommendations(BOB, 10)).toEqual([])
    expect(await repo.decideRecommendation(BOB, 'rec-1', { state: 'dismissed', at: T0 })).toBe(false)
    expect((await repo.getRecommendation(ALICE, 'rec-1'))?.state).toBe('open')
  })

  it('lists open ones newest day first and pages by cursor without a gap or a repeat', async () => {
    const days = ['2026-03-01', '2026-03-03', '2026-03-03', '2026-03-02', '2026-03-03']
    for (const [i, localDate] of days.entries()) await repo.createRecommendation(rec({ id: `r${i}`, localDate }))
    const first = await repo.listOpenRecommendations(ALICE, 2)
    expect(first.map((r) => r.id)).toEqual(['r4', 'r2'])
    const last = first[first.length - 1]!
    const second = await repo.listOpenRecommendations(ALICE, 2, { localDate: last.localDate, id: last.id })
    expect(second.map((r) => r.id)).toEqual(['r1', 'r3'])
    const third = await repo.listOpenRecommendations(ALICE, 2, { localDate: '2026-03-02', id: 'r3' })
    expect(third.map((r) => r.id)).toEqual(['r0'])
  })

  it('counts the open ones for their owner only, leaving out those decided', async () => {
    await repo.createRecommendation(rec({ id: 'a' }))
    await repo.createRecommendation(rec({ id: 'b' }))
    await repo.createRecommendation(rec({ id: 'c' }))
    await repo.decideRecommendation(ALICE, 'c', { state: 'dismissed', at: T0 })
    expect(await repo.countOpenRecommendations(ALICE)).toBe(2)
    expect(await repo.countOpenRecommendations(BOB)).toBe(0)
  })

  it('submits once, keeping the transaction, and leaves the open list', async () => {
    await repo.createRecommendation(rec())
    expect(await repo.decideRecommendation(ALICE, 'rec-1', { state: 'submitted', txnId: 42, at: T0 })).toBe(true)
    expect(await repo.decideRecommendation(ALICE, 'rec-1', { state: 'dismissed', at: T0 })).toBe(false)
    expect(await repo.getRecommendation(ALICE, 'rec-1')).toMatchObject({ state: 'submitted', txnId: 42, decidedAt: T0 })
    expect(await repo.listOpenRecommendations(ALICE, 10)).toEqual([])
  })

  it('dismisses without a transaction', async () => {
    await repo.createRecommendation(rec())
    expect(await repo.decideRecommendation(ALICE, 'rec-1', { state: 'dismissed', at: T0 })).toBe(true)
    expect(await repo.getRecommendation(ALICE, 'rec-1')).toMatchObject({ state: 'dismissed', txnId: null })
  })

  it('lets a transaction answer for one recommendation only', async () => {
    await repo.createRecommendation(rec({ id: 'a' }))
    await repo.createRecommendation(rec({ id: 'b' }))
    await repo.decideRecommendation(ALICE, 'a', { state: 'submitted', txnId: 7, at: T0 })
    await expect(repo.decideRecommendation(ALICE, 'b', { state: 'submitted', txnId: 7, at: T0 })).rejects.toThrow()
    expect((await repo.getRecommendation(ALICE, 'b'))?.state).toBe('open')
  })
})
