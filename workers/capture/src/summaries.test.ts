import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { createD1AccessRepository } from '../../../functions/_shared/adapters/d1AccessRepository'
import { createD1CaptureRepository } from '../../../functions/_shared/adapters/d1CaptureRepository'
import { createD1PushRepository } from '../../../functions/_shared/adapters/d1PushRepository'
import type { NewRecommendation } from '../../../src/domain/ports/captureRepository'
import { migratedDatabase, sqliteD1 } from '../../../src/testing/sqliteD1'
import type { CaptureEnv } from './env'
import worker from './index'
import type { PushLogLine } from './pushLog'
import { runSummaries, summaryPayload } from './summaries'
import { base64urlEncode } from './webpush'

const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'
// 20:00 in Madrid on Monday 23 November 2026 (winter time, UTC+1).
const EVENING = new Date('2026-11-23T19:00:00.000Z')
const ENDPOINT = 'https://push.example.test/send/device-one'
const ENDPOINT_TWO = 'https://push.example.test/send/device-two'

let db: DatabaseSync
let env: CaptureEnv
const lines: PushLogLine[] = []
const calls: Array<{ url: string; init: RequestInit }> = []
let answer: (url: string) => number | Error

const repos = () => ({ captures: createD1CaptureRepository(env), push: createD1PushRepository(env) })

async function addDevice(
  owner: string,
  endpoint: string,
  id: string,
): Promise<void> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair
  const point = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer)
  await repos().push.saveSubscription({
    id,
    owner,
    endpoint,
    p256dh: base64urlEncode(point),
    auth: base64urlEncode(crypto.getRandomValues(new Uint8Array(16))),
    label: 'iPhone',
    createdAt: EVENING.toISOString(),
  })
}

function rec(
  id: string,
  over: Partial<NewRecommendation> = {},
): NewRecommendation {
  return {
    id,
    owner: ALICE,
    accountId: null,
    amountCents: 1250,
    currency: 'EUR',
    occurredAt: '2026-11-23T08:00:00+01:00',
    localDate: '2026-11-23',
    merchantRaw: null,
    descriptionSuggested: null,
    suggestedType: 'expense',
    createdAt: EVENING.toISOString(),
    ...over,
  }
}

const choose = (
  mode: 'daily' | 'weekly' | 'each',
  timeZone = 'Europe/Madrid',
  owner = ALICE,
) => repos().push.saveSettings(owner, { mode, timeZone }, false)

const deps = (now: Date = EVENING) => ({
  push: repos().push,
  captures: repos().captures,
  now: () => now,
  log: (l: PushLogLine) => lines.push(l),
  fetcher: ((
    url: string,
    init: RequestInit,
  ) => {
    calls.push({ url, init })
    const result = answer(url)
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(new Response(null, { status: result }))
  }) as unknown as typeof fetch,
})

const outcomes = () => lines.map((l) => [l.outcome, l.reason])

beforeEach(async () => {
  db = migratedDatabase()
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const publicKey = base64urlEncode(
    new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer),
  )
  env = {
    DB: sqliteD1(db),
    VAPID_PRIVATE_KEY: jwk.d as string,
    VAPID_PUBLIC_KEY: publicKey,
    VAPID_SUBJECT: 'https://app.example.test',
  }
  await createD1AccessRepository(env).grantAccess(ALICE, ALICE)
  lines.length = 0
  calls.length = 0
  answer = () => 201
})

afterEach(() => undefined)

describe('the summary payload', () => {
  it('names the count and the total when there is one, and opens the list', () => {
    expect(JSON.parse(summaryPayload({ count: 3, totalCents: 4820, currency: 'EUR', onlyId: null }))).toEqual({
      v: 1,
      kind: 'summary',
      url: '/',
      count: 3,
      totalCents: 4820,
      currency: 'EUR',
      open: 3,
    })
  })

  it('leaves the total out when there is none, and opens the one payment when only one is waiting', () => {
    expect(JSON.parse(summaryPayload({ count: 2, totalCents: null, currency: null, onlyId: null }))).toEqual({
      v: 1,
      kind: 'summary',
      url: '/',
      count: 2,
      open: 2,
    })
    expect(JSON.parse(summaryPayload({ count: 1, totalCents: 1250, currency: 'EUR', onlyId: 'rec-1' })).url).toBe(
      '/?review=rec-1',
    )
  })
})

describe('runSummaries', () => {
  it('sends a due person one summary per device, with the summary headers, and marks it sent', async () => {
    await choose('daily')
    await addDevice(ALICE, ENDPOINT, 'one')
    await addDevice(ALICE, ENDPOINT_TWO, 'two')
    await repos().captures.createRecommendation(rec('a'))
    await repos().captures.createRecommendation(rec('b', { amountCents: 3000 }))
    await runSummaries(env, deps())
    expect(calls.map((c) => c.url).sort()).toEqual([ENDPOINT, ENDPOINT_TWO])
    expect(calls[0]?.init.headers).toMatchObject({
      Topic: 'review-summary',
      TTL: '86400',
      Urgency: 'high',
      'Content-Encoding': 'aes128gcm',
    })
    expect(outcomes()).toEqual([
      ['sent', 'ok'],
      ['sent', 'ok'],
    ])
    expect((await repos().push.getSettings(ALICE))?.lastSummaryAt).toBe(EVENING.toISOString())
    expect((await repos().push.listDevices(ALICE)).map((d) => d.lastStatus)).toEqual([201, 201])
  })

  it('sends nothing the second time in the same evening, and the next evening sends again', async () => {
    await choose('daily')
    await addDevice(ALICE, ENDPOINT, 'one')
    await repos().captures.createRecommendation(rec('a'))
    await runSummaries(env, deps())
    await runSummaries(env, deps(new Date('2026-11-23T19:00:20.000Z')))
    await runSummaries(env, deps(new Date('2026-11-23T21:00:00.000Z')))
    expect(calls).toHaveLength(1)
    await runSummaries(env, deps(new Date('2026-11-24T19:00:00.000Z')))
    expect(calls).toHaveLength(2)
  })

  it('lets two runs at once send once', async () => {
    await choose('daily')
    await addDevice(ALICE, ENDPOINT, 'one')
    await repos().captures.createRecommendation(rec('a'))
    await Promise.all([runSummaries(env, deps()), runSummaries(env, deps())])
    expect(calls).toHaveLength(1)
    expect(outcomes()).toContainEqual(['skipped', 'already-sent'])
  })

  it("sends a late run the same evening, but not before 20:00 and not on a weekly person's Tuesday", async () => {
    await choose('daily')
    await addDevice(ALICE, ENDPOINT, 'one')
    await repos().captures.createRecommendation(rec('a'))
    await runSummaries(env, deps(new Date('2026-11-23T18:59:00.000Z')))
    expect(calls).toHaveLength(0)
    await runSummaries(env, deps(new Date('2026-11-23T22:00:00.000Z')))
    expect(calls).toHaveLength(1)
    await choose('weekly')
    await runSummaries(env, deps(new Date('2026-11-24T19:00:00.000Z')))
    expect(calls).toHaveLength(1)
  })

  it("judges 20:00 by the person's zone across a summer time change", async () => {
    await choose('daily')
    await addDevice(ALICE, ENDPOINT, 'one')
    await repos().captures.createRecommendation(rec('a'))
    await runSummaries(env, deps(new Date('2027-03-28T17:00:00.000Z'))) // 19:00 CEST: not yet
    expect(calls).toHaveLength(0)
    await runSummaries(env, deps(new Date('2027-03-28T18:00:00.000Z'))) // 20:00 CEST
    expect(calls).toHaveLength(1)
  })

  it('sends a weekly person theirs on Monday only', async () => {
    await choose('weekly')
    await addDevice(ALICE, ENDPOINT, 'one')
    await repos().captures.createRecommendation(rec('a'))
    await runSummaries(env, deps(new Date('2026-11-22T19:00:00.000Z')))
    expect(calls).toHaveLength(0)
    await runSummaries(env, deps())
    expect(calls).toHaveLength(1)
    await runSummaries(env, deps(new Date('2026-11-30T19:00:00.000Z')))
    expect(calls).toHaveLength(2)
  })

  it('says nothing and marks nothing for a person with nothing waiting, so a later payment still gets its summary', async () => {
    await choose('daily')
    await addDevice(ALICE, ENDPOINT, 'one')
    await runSummaries(env, deps())
    expect(outcomes()).toEqual([['skipped', 'nothing-waiting']])
    expect((await repos().push.getSettings(ALICE))?.lastSummaryAt).toBeNull()
    await repos().captures.createRecommendation(rec('a'))
    await runSummaries(env, deps(new Date('2026-11-23T20:00:00.000Z')))
    expect(calls).toHaveLength(1)
  })

  it('skips a person with no devices without marking them', async () => {
    await choose('daily')
    await repos().captures.createRecommendation(rec('a'))
    await runSummaries(env, deps())
    expect(outcomes()).toEqual([['skipped', 'no-devices']])
    expect((await repos().push.getSettings(ALICE))?.lastSummaryAt).toBeNull()
  })

  it('skips a stored zone the platform does not know, and carries on with the next person', async () => {
    await createD1AccessRepository(env).grantAccess(BOB, ALICE)
    await choose('daily', 'Nowhere/Land')
    await choose('daily', 'Europe/Madrid', BOB)
    await addDevice(ALICE, ENDPOINT, 'one')
    await addDevice(BOB, ENDPOINT_TWO, 'two')
    await repos().captures.createRecommendation(rec('a'))
    await repos().captures.createRecommendation(rec('b', { owner: BOB }))
    await runSummaries(env, deps())
    expect(calls.map((c) => c.url)).toEqual([ENDPOINT_TWO])
    expect(outcomes()).toEqual([
      ['skipped', 'invalid-zone'],
      ['sent', 'ok'],
    ])
  })

  it('leaves a person who wants a push per payment alone', async () => {
    await choose('each')
    await addDevice(ALICE, ENDPOINT, 'one')
    await repos().captures.createRecommendation(rec('a'))
    await runSummaries(env, deps())
    expect(calls).toHaveLength(0)
    expect(lines).toEqual([])
  })

  it('deletes a device the push service no longer knows, keeps the other, and a failure stops no one', async () => {
    await choose('daily')
    await addDevice(ALICE, ENDPOINT, 'one')
    await addDevice(ALICE, ENDPOINT_TWO, 'two')
    await repos().captures.createRecommendation(rec('a'))
    answer = (url) => (url === ENDPOINT ? 410 : 503)
    await runSummaries(env, deps())
    expect((await repos().push.listDevices(ALICE)).map((d) => d.id)).toEqual(['two'])
    expect(outcomes().sort()).toEqual([
      ['failed', 'push-service-error'],
      ['gone', 'expired'],
    ])
  })

  it('logs a failed fetch and a timeout and still sends to the next device', async () => {
    await choose('daily')
    await addDevice(ALICE, ENDPOINT, 'one')
    await addDevice(ALICE, ENDPOINT_TWO, 'two')
    await repos().captures.createRecommendation(rec('a'))
    answer = (url) => (url === ENDPOINT ? new Error('offline') : 201)
    await runSummaries(env, deps())
    expect(outcomes().sort()).toEqual([
      ['failed', 'network'],
      ['sent', 'ok'],
    ])
  })

  it("still sends to the other device, and does not throw, when recording one device's result fails", async () => {
    await choose('daily')
    await addDevice(ALICE, ENDPOINT, 'one')
    await addDevice(ALICE, ENDPOINT_TWO, 'two')
    await repos().captures.createRecommendation(rec('a'))
    const push = {
      ...repos().push,
      recordSend: (
        owner: string,
        id: string,
        status: number,
        at: string,
      ) => (id === 'one' ? Promise.reject(new Error('boom')) : repos().push.recordSend(owner, id, status, at)),
    }
    await expect(runSummaries(env, { ...deps(), push })).resolves.toBeUndefined()
    expect(calls.map((c) => c.url).sort()).toEqual([ENDPOINT, ENDPOINT_TWO])
    expect(outcomes().sort()).toEqual([
      ['failed', 'exception'],
      ['sent', 'ok'],
    ])
    expect((await repos().push.listDevices(ALICE)).find((d) => d.id === 'two')?.lastStatus).toBe(201)
  })

  it('does nothing and logs not-configured once, however many people there are', async () => {
    await createD1AccessRepository(env).grantAccess(BOB, ALICE)
    await choose('daily')
    await choose('daily', 'Europe/Madrid', BOB)
    await addDevice(ALICE, ENDPOINT, 'one')
    await repos().captures.createRecommendation(rec('a'))
    await runSummaries({ ...env, VAPID_PUBLIC_KEY: undefined }, deps())
    expect(outcomes()).toEqual([['skipped', 'not-configured']])
    expect(calls).toHaveLength(0)
    expect((await repos().push.getSettings(ALICE))?.lastSummaryAt).toBeNull()
  })

  it('writes no endpoint, key, owner or payment text to the log', async () => {
    await choose('daily', 'Nowhere/Land')
    await createD1AccessRepository(env).grantAccess(BOB, ALICE)
    await choose('daily', 'Europe/Madrid', BOB)
    await addDevice(BOB, ENDPOINT, 'one')
    await repos().captures.createRecommendation(rec('a', { owner: BOB, merchantRaw: 'Shop Example' }))
    await runSummaries(env, deps())
    const written = JSON.stringify(lines)
    for (const secret of [ENDPOINT, env.VAPID_PRIVATE_KEY, env.VAPID_PUBLIC_KEY, ALICE, BOB, 'Shop Example'])
      expect(written).not.toContain(secret as string)
  })

  it("never throws: a failed read is one failed line, and one person's failure stops no one", async () => {
    await runSummaries(env, {
      ...deps(),
      push: { ...repos().push, listSummaryPeople: () => Promise.reject(new Error('boom')) },
    })
    expect(outcomes()).toEqual([['failed', 'exception']])
    lines.length = 0
    await createD1AccessRepository(env).grantAccess(BOB, ALICE)
    await choose('daily')
    await choose('daily', 'Europe/Madrid', BOB)
    await addDevice(BOB, ENDPOINT, 'one')
    await repos().captures.createRecommendation(rec('b', { owner: BOB }))
    const captures = {
      summarizeOpen: (owner: string) =>
        owner === ALICE ? Promise.reject(new Error('boom')) : repos().captures.summarizeOpen(owner),
    }
    await runSummaries(env, { ...deps(), captures })
    expect(outcomes()).toEqual([
      ['failed', 'exception'],
      ['sent', 'ok'],
    ])
  })
})

describe('the Worker’s scheduled handler', () => {
  it("runs the summaries at the cron's own scheduled time", async () => {
    await choose('daily')
    await addDevice(ALICE, ENDPOINT, 'one')
    await repos().captures.createRecommendation(rec('a'))
    const pending: Array<Promise<unknown>> = []
    const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p) } as unknown as ExecutionContext
    const fetched: string[] = []
    const original = globalThis.fetch
    globalThis.fetch = ((url: string) => (
      fetched.push(url),
      Promise.resolve(new Response(null, { status: 201 }))
    )) as unknown as typeof fetch
    try {
      await worker.scheduled(
        { scheduledTime: EVENING.getTime(), cron: '0 * * * *' } as unknown as ScheduledController,
        env,
        ctx,
      )
      await Promise.all(pending)
    } finally {
      globalThis.fetch = original
    }
    expect(fetched).toEqual([ENDPOINT])
    expect((await repos().push.getSettings(ALICE))?.lastSummaryAt).toBe(EVENING.toISOString())
  })
})
