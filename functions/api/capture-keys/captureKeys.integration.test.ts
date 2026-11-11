// @vitest-environment node
/**
 * The capture key routes through the real middleware and the real migrations: a key is made for the signed-in person
 * only, shown once, listed without its secret, and revoked by its owner alone.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { OTHER, OWNER, createExpenseWorld, type Handler, type World } from '../../_shared/testing/expenseWorld'
import { invokeExpenseApiRoute } from '../../_shared/testing/invokeExpenseApiRoute'
import { createD1ExpenseRepository } from '../../_shared/adapters/d1ExpenseRepository'
import { CAPTURE_KEY_PATTERN, parseCaptureKey, secretMatches } from '../../../src/domain/capture/captureKey'
import { onRequestDelete as revoke } from './[id]'
import { onRequestGet as list, onRequestPost as create } from './index'

const URL_BASE = 'https://expenses.test/api/capture-keys'

let world: World
let sqlite: ReturnType<typeof migratedDatabase>

beforeEach(() => {
  sqlite = migratedDatabase()
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

interface CallOptions {
  method?: string
  id?: string
  body?: unknown
  email?: string | false
  headers?: Record<string, string>
  rawBody?: BodyInit
}

function call(handler: Handler, o: CallOptions = {}): Promise<Response> {
  return invokeExpenseApiRoute({
    handler,
    repo: createD1ExpenseRepository(world.env),
    env: world.env,
    url: o.id ? `${URL_BASE}/${o.id}` : URL_BASE,
    method: o.method ?? 'GET',
    email: o.email ?? OWNER,
    ...(o.id ? { params: { id: o.id } } : {}),
    ...(o.body !== undefined ? { body: o.body } : {}),
    ...(o.rawBody !== undefined ? { rawBody: o.rawBody } : {}),
    ...(o.headers ? { extraHeaders: o.headers } : {}),
  })
}

const makeKey = (label?: unknown, email = OWNER) =>
  call(create, { method: 'POST', body: label === undefined ? {} : { label }, email })

const rows = () =>
  sqlite.prepare('SELECT key_id, owner, label, secret_hash, revoked_at FROM capture_keys ORDER BY created_at').all() as Array<{
    key_id: string
    owner: string
    label: string
    secret_hash: string
    revoked_at: string | null
  }>

describe('POST /api/capture-keys', () => {
  it('makes a key for the signed-in person and shows the whole key once', async () => {
    const response = await makeKey('My phone')
    const body = (await response.json()) as { key: string; keyId: string; label: string; lastUsedAt: null }

    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(body.key).toMatch(CAPTURE_KEY_PATTERN)
    expect(body).toMatchObject({ keyId: parseCaptureKey(body.key)?.keyId, label: 'My phone', lastUsedAt: null })
    const stored = rows()
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ owner: OWNER, key_id: body.keyId, label: 'My phone' })
  })

  it('stores a hash that the secret matches, and not the secret', async () => {
    const { key } = (await (await makeKey()).json()) as { key: string }
    const secret = parseCaptureKey(key)?.secret ?? ''

    const [stored] = rows()
    expect(JSON.stringify(stored)).not.toContain(secret)
    expect(await secretMatches(stored?.secret_hash ?? '', secret)).toBe(true)
  })

  it('names a key "Shortcut" when no label is given or the label is blank', async () => {
    await makeKey()
    await makeKey('   ')

    expect(rows().map((r) => r.label)).toEqual(['Shortcut', 'Shortcut'])
  })

  it.each([
    ['not text', 7],
    ['over 40 characters', 'x'.repeat(41)],
    ['holding a control character', 'a\u0000b'],
    ['holding a bidi override', 'a\u202eb'],
    ['holding a zero-width space', 'a\u200bb'],
    ['holding a line separator', 'a\u2028b'],
    ['holding a byte-order mark', 'a\ufeffb'],
  ])('refuses a label that is %s, and stores nothing', async (_name, label) => {
    const response = await makeKey(label)

    expect(response.status).toBe(400)
    expect(rows()).toEqual([])
  })

  it('takes the owner from the sign-in, never from the body', async () => {
    const response = await call(create, {
      method: 'POST',
      body: { label: 'x', owner: OTHER, keyId: '0000000000000000', secretHash: 'h' },
    })
    const { keyId } = (await response.json()) as { keyId: string }

    expect(rows()).toMatchObject([{ owner: OWNER, key_id: keyId }])
    expect(keyId).not.toBe('0000000000000000')
  })

  it('refuses a fourth key with a 409, and a person who is revoked-down can make one again', async () => {
    const made = []
    for (let i = 0; i < 3; i++) made.push((await (await makeKey(`k${i}`)).json()) as { keyId: string })

    const fourth = await makeKey('k3')
    expect(fourth.status).toBe(409)
    expect(rows()).toHaveLength(3)

    await call(revoke, { method: 'DELETE', id: made[0]?.keyId ?? '' })
    expect((await makeKey('k3')).status).toBe(201)
  })

  it('counts each person on their own', async () => {
    for (let i = 0; i < 3; i++) await makeKey(`k${i}`)

    expect((await makeKey('theirs', OTHER)).status).toBe(201)
  })

  it.each([
    ['a missing body', undefined],
    ['an array', '[]'],
    ['a string', '"x"'],
    ['null', 'null'],
  ])('needs a JSON object: %s is a 400 or 415', async (_name, raw) => {
    const response = await call(create, {
      method: 'POST',
      ...(raw === undefined ? {} : { rawBody: raw, headers: { 'content-type': 'application/json' } }),
    })

    expect([400, 415]).toContain(response.status)
    expect(rows()).toEqual([])
  })

  it('refuses a body that is not JSON-typed with a 415', async () => {
    const response = await call(create, { method: 'POST', rawBody: '{"label":"x"}', headers: { 'content-type': 'text/plain' } })

    expect(response.status).toBe(415)
    expect(rows()).toEqual([])
  })

  it('refuses a body over 1 KB', async () => {
    const response = await makeKey('x'.repeat(2000))

    expect(response.status).toBe(413)
    expect(rows()).toEqual([])
  })

  it('refuses a request from another site', async () => {
    const response = await call(create, { method: 'POST', body: {}, headers: { 'sec-fetch-site': 'cross-site' } })

    expect(response.status).toBe(403)
    expect(rows()).toEqual([])
  })
})

describe('GET /api/capture-keys', () => {
  it('lists the person’s live keys, newest first, with no secret and no hash', async () => {
    const first = (await (await makeKey('first')).json()) as { keyId: string; key: string }
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = (await (await makeKey('second')).json()) as { keyId: string; key: string }

    const response = await call(list)
    const text = await response.text()
    const body = JSON.parse(text) as { keys: Array<Record<string, unknown>> }

    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(body.keys.map((k) => k.keyId)).toEqual([second.keyId, first.keyId])
    expect(Object.keys(body.keys[0] ?? {}).sort()).toEqual(['createdAt', 'keyId', 'label', 'lastUsedAt'])
    for (const { key } of [first, second]) expect(text).not.toContain(parseCaptureKey(key)?.secret ?? 'x')
    for (const row of rows()) expect(text).not.toContain(row.secret_hash)
  })

  it('does not list another person’s keys, or a revoked one', async () => {
    const mine = (await (await makeKey('mine')).json()) as { keyId: string }
    await makeKey('theirs', OTHER)
    const gone = (await (await makeKey('gone')).json()) as { keyId: string }
    await call(revoke, { method: 'DELETE', id: gone.keyId })

    const body = (await (await call(list)).json()) as { keys: Array<{ keyId: string }> }

    expect(body.keys.map((k) => k.keyId)).toEqual([mine.keyId])
  })
})

describe('DELETE /api/capture-keys/:id', () => {
  it('revokes the person’s own key, once', async () => {
    const { keyId } = (await (await makeKey()).json()) as { keyId: string }

    const first = await call(revoke, { method: 'DELETE', id: keyId })
    const again = await call(revoke, { method: 'DELETE', id: keyId })

    expect(first.status).toBe(200)
    expect(again.status).toBe(404)
    expect(rows()[0]?.revoked_at).not.toBeNull()
  })

  it('answers 404, and changes nothing, for another person’s key', async () => {
    const { keyId } = (await (await makeKey('theirs', OTHER)).json()) as { keyId: string }

    const response = await call(revoke, { method: 'DELETE', id: keyId })

    expect(response.status).toBe(404)
    expect(rows()[0]?.revoked_at).toBeNull()
  })

  it.each(['0000000000000000', 'nope', '0123456789ABCDEF', '0123456789abcdef0'])('answers 404 for %s', async (id) => {
    expect((await call(revoke, { method: 'DELETE', id })).status).toBe(404)
  })
})

describe('who may call', () => {
  it('refuses a request with no sign-in, a stranger, and a bearer key, on every method', async () => {
    const { key, keyId } = (await (await makeKey()).json()) as { key: string; keyId: string }
    const attempts = [
      (email: string | false, headers?: Record<string, string>) => call(list, { email, ...(headers ? { headers } : {}) }),
      (email: string | false, headers?: Record<string, string>) =>
        call(create, { method: 'POST', body: {}, email, ...(headers ? { headers } : {}) }),
      (email: string | false, headers?: Record<string, string>) =>
        call(revoke, { method: 'DELETE', id: keyId, email, ...(headers ? { headers } : {}) }),
    ]

    for (const attempt of attempts) {
      expect((await attempt(false)).status).toBe(401)
      expect((await attempt(false, { authorization: `Bearer ${key}` })).status).toBe(401)
      expect((await attempt('stranger@example.com')).status).toBe(403)
    }
    expect(rows()).toHaveLength(1)
    expect(rows()[0]?.revoked_at).toBeNull()
  })
})
