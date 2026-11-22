import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { createD1AccessRepository } from '../../../functions/_shared/adapters/d1AccessRepository'
import { createD1CaptureRepository } from '../../../functions/_shared/adapters/d1CaptureRepository'
import { createD1PushRepository } from '../../../functions/_shared/adapters/d1PushRepository'
import { mintCaptureKey } from '../../../src/domain/capture'
import type { MintedCaptureKey } from '../../../src/domain/capture'
import { migratedDatabase, sqliteD1 } from '../../../src/testing/sqliteD1'
import type { CaptureEnv } from './env'
import worker from './index'
import { notifyPayment, paymentPayload, vapidKeysOf } from './notify'
import type { CreatedPayment } from './notify'
import type { PushLogLine } from './pushLog'
import { PushTimeoutError, base64urlEncode } from './webpush'

const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'
const NOW = new Date('2026-11-03T08:45:00.000Z')
const ENDPOINT = 'https://push.example.test/send/device-one'
const ENDPOINT_TWO = 'https://push.example.test/send/device-two'
const text = new TextEncoder()

interface Device {
  p256dh: string
  auth: string
  privateKey: CryptoKey
  publicRaw: Uint8Array
  authRaw: Uint8Array
}

let db: DatabaseSync
let env: CaptureEnv
let minted: MintedCaptureKey
let vapid: { VAPID_PRIVATE_KEY: string; VAPID_PUBLIC_KEY: string; VAPID_SUBJECT: string }
const pending: Array<Promise<unknown>> = []
const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p) } as unknown as ExecutionContext

async function newDevice(): Promise<Device> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair
  const publicRaw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer)
  const authRaw = crypto.getRandomValues(new Uint8Array(16))
  return {
    p256dh: base64urlEncode(publicRaw),
    auth: base64urlEncode(authRaw),
    privateKey: pair.privateKey,
    publicRaw,
    authRaw,
  }
}

async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  bytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8))
}

/** The receiving side of RFC 8291: what the device's browser does with the body it is sent. */
async function decrypt(
  device: Device,
  body: Uint8Array,
): Promise<string> {
  const salt = body.slice(0, 16)
  const senderPublic = body.slice(21, 21 + body[20]!)
  const sealed = body.slice(21 + body[20]!)
  const senderKey = await crypto.subtle.importKey('raw', senderPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const algorithm = { name: 'ECDH', public: senderKey } as unknown as EcdhKeyDeriveParams
  const shared = new Uint8Array(await crypto.subtle.deriveBits(algorithm, device.privateKey, 256))
  const info = new Uint8Array([...text.encode('WebPush: info\0'), ...device.publicRaw, ...senderPublic])
  const ikm = await hkdf(shared, device.authRaw, info, 32)
  const cek = await hkdf(ikm, salt, text.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(ikm, salt, text.encode('Content-Encoding: nonce\0'), 12)
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, sealed))
  expect(plain[plain.length - 1]).toBe(2)
  return new TextDecoder().decode(plain.slice(0, -1))
}

const repos = () => ({
  captures: createD1CaptureRepository(env),
  access: createD1AccessRepository(env),
  push: createD1PushRepository(env),
})

async function addDevice(
  owner: string,
  endpoint: string,
  id: string,
): Promise<Device> {
  const device = await newDevice()
  await repos().push.saveSubscription({
    id,
    owner,
    endpoint,
    p256dh: device.p256dh,
    auth: device.auth,
    label: 'iPhone',
    createdAt: NOW.toISOString(),
  })
  return device
}

beforeEach(async () => {
  pending.length = 0
  db = migratedDatabase()
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const publicKey = base64urlEncode(
    new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer),
  )
  vapid = { VAPID_PRIVATE_KEY: jwk.d as string, VAPID_PUBLIC_KEY: publicKey, VAPID_SUBJECT: 'https://app.example.test' }
  env = { DB: sqliteD1(db), OWNER_EMAIL: ALICE, CAPTURE_REPLAY_SECRET: 'replay-secret', ...vapid }
  await repos().access.grantAccess(ALICE, ALICE)
  await repos().access.grantAccess(BOB, ALICE)
  minted = await mintCaptureKey()
  await repos().captures.createKey({
    keyId: minted.keyId,
    owner: ALICE,
    label: 'Phone',
    secretHash: minted.secretHash,
    createdAt: NOW.toISOString(),
  })
})

afterEach(() => vi.unstubAllGlobals())

const payment: CreatedPayment = {
  owner: ALICE,
  recommendationId: '0f8fad5b-d9cb-469f-a165-70867728950e',
  amountCents: 1250,
  currency: 'EUR',
  merchant: 'Shop Example',
}

describe('the payload', () => {
  it('is what the service worker reads, with the tap going to the payment', () => {
    expect(JSON.parse(paymentPayload(payment, 3))).toEqual({
      v: 1,
      kind: 'payment',
      id: payment.recommendationId,
      url: `/?review=${payment.recommendationId}`,
      amountCents: 1250,
      currency: 'EUR',
      merchant: 'Shop Example',
      open: 3,
    })
  })

  it('reads the keys only when all three are set', () => {
    expect(vapidKeysOf(env)).toEqual({
      privateKey: vapid.VAPID_PRIVATE_KEY,
      publicKey: vapid.VAPID_PUBLIC_KEY,
      subject: vapid.VAPID_SUBJECT,
    })
    expect(vapidKeysOf({ ...env, VAPID_SUBJECT: undefined })).toBeNull()
    expect(vapidKeysOf({ ...env, VAPID_PRIVATE_KEY: '' })).toBeNull()
  })
})

describe('notifyPayment', () => {
  const lines: PushLogLine[] = []
  const calls: Array<{ url: string; init: RequestInit }> = []
  let answer: (url: string) => number | Error
  const deps = () => ({
    push: repos().push,
    countOpen: () => Promise.resolve(2),
    now: () => NOW,
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
  beforeEach(() => {
    lines.length = 0
    calls.length = 0
    answer = () => 201
  })
  const choose = (mode: 'each' | 'daily' | 'weekly') =>
    repos().push.saveSettings(ALICE, { mode, timeZone: 'Europe/Madrid' }, false)

  it('sends one encrypted push per device, with the headers and a payload the device can read', async () => {
    const one = await addDevice(ALICE, ENDPOINT, 'one')
    const two = await addDevice(ALICE, ENDPOINT_TWO, 'two')
    await addDevice(BOB, 'https://push.example.test/send/bobs', 'bobs')
    await choose('each')
    await notifyPayment(payment, env, deps())
    expect(calls.map((c) => c.url).sort()).toEqual([ENDPOINT, ENDPOINT_TWO])
    for (const [device, url] of [
      [one, ENDPOINT],
      [two, ENDPOINT_TWO],
    ] as const) {
      const call = calls.find((c) => c.url === url)!
      const headers = call.init.headers as Record<string, string>
      expect(headers).toMatchObject({
        TTL: '86400',
        Urgency: 'high',
        Topic: '0f8fad5bd9cb469fa16570867728950e',
        'Content-Encoding': 'aes128gcm',
      })
      expect(headers.Topic).toHaveLength(32)
      expect(headers.Authorization).toMatch(
        new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${vapid.VAPID_PUBLIC_KEY}$`),
      )
      const body = call.init.body as Uint8Array
      expect(body.length).toBeGreaterThan(144)
      expect(JSON.parse(await decrypt(device, body))).toMatchObject({
        kind: 'payment',
        id: payment.recommendationId,
        amountCents: 1250,
        merchant: 'Shop Example',
        open: 2,
      })
    }
    expect(lines.map((l) => [l.outcome, l.reason, l.status, l.devices])).toEqual([
      ['sent', 'ok', 201, 2],
      ['sent', 'ok', 201, 2],
    ])
    const devices = await repos().push.listDevices(ALICE)
    expect(devices.map((d) => [d.lastStatus, d.lastSentAt])).toEqual([
      [201, NOW.toISOString()],
      [201, NOW.toISOString()],
    ])
  })

  it('writes no endpoint, key, owner or payment text to the log', async () => {
    await addDevice(ALICE, ENDPOINT, 'one')
    await choose('each')
    await notifyPayment(payment, env, deps())
    const written = JSON.stringify(lines)
    for (const secret of [
      ENDPOINT,
      vapid.VAPID_PRIVATE_KEY,
      vapid.VAPID_PUBLIC_KEY,
      ALICE,
      'Shop Example',
      payment.recommendationId,
    ])
      expect(written).not.toContain(secret)
  })

  it.each([404, 410])('deletes a device the push service answers %i for, and keeps the other', async (status) => {
    await addDevice(ALICE, ENDPOINT, 'one')
    await addDevice(ALICE, ENDPOINT_TWO, 'two')
    await choose('each')
    answer = (url) => (url === ENDPOINT ? status : 201)
    await notifyPayment(payment, env, deps())
    expect((await repos().push.listDevices(ALICE)).map((d) => d.id)).toEqual(['two'])
    expect(lines.map((l) => [l.outcome, l.reason, l.status]).sort()).toEqual([
      ['gone', 'expired', status],
      ['sent', 'ok', 201],
    ])
  })

  it('keeps the device on a 429 or a 5xx and records the answer, with no retry', async () => {
    await addDevice(ALICE, ENDPOINT, 'one')
    await choose('each')
    answer = () => 503
    await notifyPayment(payment, env, deps())
    expect(calls).toHaveLength(1)
    expect(lines.map((l) => [l.outcome, l.reason, l.status])).toEqual([['failed', 'push-service-error', 503]])
    expect((await repos().push.listDevices(ALICE))[0]).toMatchObject({ lastStatus: 503 })
  })

  it('logs a failed fetch and still sends to the next device', async () => {
    await addDevice(ALICE, ENDPOINT, 'one')
    await addDevice(ALICE, ENDPOINT_TWO, 'two')
    await choose('each')
    answer = (url) => (url === ENDPOINT ? new Error('offline') : 201)
    await notifyPayment(payment, env, deps())
    expect(lines.map((l) => [l.outcome, l.reason]).sort()).toEqual([
      ['failed', 'network'],
      ['sent', 'ok'],
    ])
  })

  it('logs a push service that does not answer in time as its own reason', async () => {
    await addDevice(ALICE, ENDPOINT, 'one')
    await choose('each')
    answer = () => new PushTimeoutError()
    await notifyPayment(payment, env, deps())
    expect(lines.map((l) => [l.outcome, l.reason])).toEqual([['failed', 'timeout']])
  })

  it('never throws: a database failure is one failed line', async () => {
    await notifyPayment(payment, env, {
      ...deps(),
      push: { ...repos().push, getSettings: () => Promise.reject(new Error('boom')) },
    })
    expect(lines.map((l) => [l.outcome, l.reason])).toEqual([['failed', 'exception']])
    await addDevice(ALICE, ENDPOINT, 'one')
    await choose('each')
    lines.length = 0
    await notifyPayment(payment, env, { ...deps(), countOpen: () => Promise.reject(new Error('boom')) })
    expect(lines.map((l) => [l.outcome, l.reason])).toEqual([['failed', 'exception']])
  })

  it('also fails softly when one device’s own handling throws', async () => {
    await addDevice(ALICE, ENDPOINT, 'one')
    await choose('each')
    await notifyPayment(payment, env, {
      ...deps(),
      push: { ...repos().push, recordSend: () => Promise.reject(new Error('boom')) },
    })
    expect(lines.map((l) => [l.outcome, l.reason])).toEqual([['failed', 'exception']])
  })

  it("still sends to the other device when recording one device's result fails", async () => {
    await addDevice(ALICE, ENDPOINT, 'one')
    await addDevice(ALICE, ENDPOINT_TWO, 'two')
    await choose('each')
    const push = {
      ...repos().push,
      recordSend: (
        owner: string,
        id: string,
        status: number,
        at: string,
      ) => (id === 'one' ? Promise.reject(new Error('boom')) : repos().push.recordSend(owner, id, status, at)),
    }
    await notifyPayment(payment, env, { ...deps(), push })
    expect(calls).toHaveLength(2)
    expect(lines.map((l) => [l.outcome, l.reason]).sort()).toEqual([
      ['failed', 'exception'],
      ['sent', 'ok'],
    ])
  })

  it('skips with the keys unset', async () => {
    await addDevice(ALICE, ENDPOINT, 'one')
    await choose('each')
    await notifyPayment(payment, { ...env, VAPID_PRIVATE_KEY: undefined }, deps())
    expect(lines.map((l) => [l.outcome, l.reason])).toEqual([['skipped', 'not-configured']])
    expect(calls).toEqual([])
  })

  it('skips a person with no choice saved, with no devices, or who wants summaries', async () => {
    await notifyPayment(payment, env, deps())
    await choose('each')
    await notifyPayment(payment, env, deps())
    await addDevice(ALICE, ENDPOINT, 'one')
    await choose('daily')
    await notifyPayment(payment, env, deps())
    await choose('weekly')
    await notifyPayment(payment, env, deps())
    expect(lines.map((l) => l.reason)).toEqual(['no-devices', 'no-devices', 'summary-mode', 'summary-mode'])
    expect(calls).toEqual([])
  })
})

describe('the Worker', () => {
  const calls: string[] = []
  let status: number | Error
  const pushes = () => calls.length
  const request = (over: { title?: string; body?: string; source?: string; at?: Date } = {}) =>
    new Request('https://capture.example.test/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${minted.key}` },
      body: JSON.stringify({
        source: over.source ?? 'mybank',
        title: over.title ?? 'Card payment',
        body: over.body ?? 'Shop Example *4321 10,50 EUR',
        date: (over.at ?? new Date()).toISOString(),
      }),
    })
  const capture = async (req: Request) => {
    const res = await worker.fetch(req, env, ctx)
    await Promise.all(pending.splice(0))
    return res
  }
  beforeEach(async () => {
    calls.length = 0
    status = 201
    vi.stubGlobal('fetch', (url: string) => {
      calls.push(url)
      return status instanceof Error ? Promise.reject(status) : Promise.resolve(new Response(null, { status }))
    })
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    await addDevice(ALICE, ENDPOINT, 'one')
    await repos().push.saveSettings(ALICE, { mode: 'each', timeZone: 'Europe/Madrid' }, false)
  })
  afterEach(() => vi.restoreAllMocks())

  it('sends one push for a stored payment, after the answer', async () => {
    const res = await capture(request())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(calls).toEqual([ENDPOINT])
  })

  it('sends nothing for a replay or for a push that joins a recommendation', async () => {
    const at = new Date()
    await capture(request({ at }))
    expect(pushes()).toBe(1)
    await capture(request({ at }))
    const later = new Date(at.getTime() + 8000)
    await capture(
      request({ title: 'Balance changed', body: 'A movement of -10.50 EUR on your account **5512', at: later }),
    )
    expect(db.prepare('SELECT COUNT(*) AS n FROM recommendations').get()).toEqual({ n: 1 })
    expect(pushes()).toBe(1)
  })

  it('sends nothing to a person who chose a summary, and nothing for a push that stores nothing', async () => {
    await repos().push.saveSettings(ALICE, { mode: 'daily', timeZone: 'Europe/Madrid' }, false)
    await capture(request())
    await repos().push.saveSettings(ALICE, { mode: 'each', timeZone: 'Europe/Madrid' }, false)
    await capture(request({ body: 'no amount here' }))
    expect(pushes()).toBe(0)
  })

  it('answers 200 and stores the payment when the push service fails', async () => {
    status = new Error('offline')
    const res = await capture(request())
    expect(res.status).toBe(200)
    expect(db.prepare('SELECT COUNT(*) AS n FROM recommendations').get()).toEqual({ n: 1 })
  })

  it('behaves as before with no VAPID secrets: captures, sends nothing, raises nothing', async () => {
    const bare = { DB: env.DB, OWNER_EMAIL: ALICE, CAPTURE_REPLAY_SECRET: 'replay-secret' }
    env = bare
    const res = await capture(request())
    expect(res.status).toBe(200)
    expect(pushes()).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS n FROM recommendations').get()).toEqual({ n: 1 })
  })

  it('does not wait for the send before answering', async () => {
    let release: (() => void) | null = null
    vi.stubGlobal(
      'fetch',
      () => new Promise<Response>((resolve) => (release = () => resolve(new Response(null, { status: 201 })))),
    )
    const res = await worker.fetch(request(), env, ctx)
    expect(res.status).toBe(200)
    expect(pending).toHaveLength(1)
    await vi.waitFor(() => expect(release).not.toBeNull())
    ;(release as unknown as () => void)()
    await Promise.all(pending.splice(0))
  })
})
