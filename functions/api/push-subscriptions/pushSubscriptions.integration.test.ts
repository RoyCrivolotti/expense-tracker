// @vitest-environment node
/**
 * The web push routes through the real middleware and the real migrations: a device is saved for the signed-in person
 * only, on a known push service only, listed without its keys, forgotten by its owner alone; the person's choice is
 * theirs; none of it moves the dataset revision.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { OTHER, OWNER, createExpenseWorld, type Handler, type World } from '../../_shared/testing/expenseWorld'
import { invokeExpenseApiRoute } from '../../_shared/testing/invokeExpenseApiRoute'
import { createD1ExpenseRepository } from '../../_shared/adapters/d1ExpenseRepository'
import { onRequestGet as config } from '../push-config'
import { onRequestPut as saveSettings } from '../push-settings'
import { onRequestDelete as remove } from './[id]'
import { onRequestGet as list, onRequestPut as save } from './index'

const ORIGIN = 'https://expenses.test'
const APPLE = 'https://web.push.apple.com/device-one'
const P256DH = `B${'A'.repeat(86)}`
const AUTH = 'a'.repeat(22)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

let world: World
let sqlite: ReturnType<typeof migratedDatabase>

beforeEach(() => {
  sqlite = migratedDatabase()
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

interface CallOptions {
  path: string
  method?: string
  id?: string
  body?: unknown
  email?: string | false
}

function call(
  handler: Handler,
  o: CallOptions,
): Promise<Response> {
  return invokeExpenseApiRoute({
    handler,
    repo: createD1ExpenseRepository(world.env),
    env: world.env,
    url: `${ORIGIN}${o.path}${o.id ? `/${o.id}` : ''}`,
    method: o.method ?? 'GET',
    email: o.email ?? OWNER,
    ...(o.id ? { params: { id: o.id } } : {}),
    ...(o.body !== undefined ? { body: o.body } : {}),
  })
}

const device = (over: Record<string, unknown> = {}) => ({
  endpoint: APPLE,
  keys: { p256dh: P256DH, auth: AUTH },
  label: 'iPhone',
  timeZone: 'Europe/Madrid',
  ...over,
})
const saveDevice = (
  body: unknown = device(),
  email: string | false = OWNER,
) => call(save, { path: '/api/push-subscriptions', method: 'PUT', body, email })
const devices = (email = OWNER) => call(list, { path: '/api/push-subscriptions', email })
const rows = () =>
  sqlite
    .prepare('SELECT id, owner, endpoint, p256dh, auth, label, last_status FROM push_subscriptions ORDER BY created_at')
    .all() as Array<Record<string, unknown>>
const settingsRow = (owner = OWNER) =>
  sqlite.prepare('SELECT mode, time_zone FROM push_settings WHERE owner = ?').get(owner)

describe('saving a device', () => {
  it('stores it for the signed-in person, gives the first device the default choice, and leaves the revision alone', async () => {
    const before = world.token()
    const res = await saveDevice()
    expect(res.status).toBe(200)
    const { id } = (await res.json()) as { id: string }
    expect(id).toMatch(UUID)
    expect(rows()).toEqual([
      { id, owner: OWNER, endpoint: APPLE, p256dh: P256DH, auth: AUTH, label: 'iPhone', last_status: null },
    ])
    expect(settingsRow()).toEqual({ mode: 'daily', time_zone: 'Europe/Madrid' })
    expect(world.token()).toBe(before)
  })

  it('refreshes a device saved again, keeping its id, and leaves a choice already made alone', async () => {
    const { id } = (await (await saveDevice()).json()) as { id: string }
    sqlite.prepare('UPDATE push_subscriptions SET last_status = 410').run()
    await call(saveSettings, { path: '/api/push-settings', method: 'PUT', body: { mode: 'each', timeZone: 'UTC' } })
    const again = await saveDevice(
      device({ label: 'My iPhone', keys: { p256dh: P256DH, auth: 'b'.repeat(22) }, timeZone: 'Europe/Lisbon' }),
    )
    expect(await again.json()).toEqual({ id })
    expect(rows()).toMatchObject([{ id, label: 'My iPhone', auth: 'b'.repeat(22), last_status: null }])
    expect(settingsRow()).toEqual({ mode: 'each', time_zone: 'UTC' })
  })

  it('gives a device to whoever is signed in on it', async () => {
    await saveDevice()
    expect((await saveDevice(device(), OTHER)).status).toBe(200)
    expect(rows().map((r) => r.owner)).toEqual([OTHER])
    expect(((await (await devices()).json()) as { devices: unknown[] }).devices).toEqual([])
  })

  it('refuses the eleventh device with 409 and stores nothing', async () => {
    for (let i = 0; i < 10; i++) expect((await saveDevice(device({ endpoint: `${APPLE}-${i}` }))).status).toBe(200)
    const res = await saveDevice(device({ endpoint: `${APPLE}-more` }))
    expect(res.status).toBe(409)
    expect(rows()).toHaveLength(10)
    expect((await saveDevice(device({ endpoint: `${APPLE}-4`, label: 'Again' }))).status).toBe(200)
  })

  it('keeps a device as the sender will address it, and takes the browser’s padded keys', async () => {
    const { id } = (await (
      await saveDevice(
        device({
          endpoint: ` ${APPLE.replace('web.push', 'WEB.PUSH')} `,
          keys: { p256dh: `${P256DH}=`, auth: `${AUTH}==` },
          label: '',
        }),
      )
    ).json()) as { id: string }
    expect(rows()).toEqual([
      { id, owner: OWNER, endpoint: APPLE, p256dh: P256DH, auth: AUTH, label: 'Device', last_status: null },
    ])
    expect(await (await saveDevice(device({ label: 'x'.repeat(40) }))).json()).toEqual({ id })
    expect(rows()[0]?.label).toBe('x'.repeat(40))
  })

  it('takes every push service browsers use', async () => {
    for (const endpoint of [
      'https://fcm.googleapis.com/fcm/send/abc:def',
      'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
      'https://wns2-par02p.notify.windows.com/w/?token=AwYAAA',
    ]) {
      expect((await saveDevice(device({ endpoint }))).status, endpoint).toBe(200)
    }
  })

  it.each([
    ['an endpoint on another host', device({ endpoint: 'https://evil.example/web.push.apple.com' })],
    ['an endpoint that only ends like a service', device({ endpoint: 'https://notify.windows.com.evil.example/x' })],
    ['a plain http endpoint', device({ endpoint: 'http://web.push.apple.com/x' })],
    ['an endpoint on another port', device({ endpoint: 'https://web.push.apple.com:8443/x' })],
    ['a label of 41 characters', device({ label: 'x'.repeat(41) })],
    ['a public key of the wrong length', device({ keys: { p256dh: 'B'.repeat(20), auth: AUTH } })],
    ['an auth secret of the wrong length', device({ keys: { p256dh: P256DH, auth: 'a'.repeat(10) } })],
    ['no keys', { endpoint: APPLE, label: 'x', timeZone: 'UTC' }],
    ['no zone', { endpoint: APPLE, keys: { p256dh: P256DH, auth: AUTH } }],
    ['a zone nobody has heard of', device({ timeZone: 'Mars/Olympus' })],
    ['a label with a control character', device({ label: 'iPhone\u0007' })],
    ['a label that is not text', device({ label: 7 })],
    ['a body that is not an object', [1, 2]],
  ])('refuses %s with 400, storing nothing', async (_what, body) => {
    const res = await saveDevice(body)
    expect(res.status).toBe(400)
    expect(rows()).toEqual([])
    expect(settingsRow()).toBeUndefined()
  })

  it('refuses a body over 2 KB', async () => {
    expect((await saveDevice(device({ label: 'x'.repeat(3000) }))).status).toBe(413)
  })

  it('needs the sign-in', async () => {
    expect((await saveDevice(device(), false)).status).toBe(401)
    expect((await devices(false as unknown as string)).status).toBe(401)
  })
})

describe('listing and forgetting devices', () => {
  it('lists the person’s own devices without their endpoints or keys, with their choice', async () => {
    const { id } = (await (await saveDevice()).json()) as { id: string }
    await saveDevice(device({ endpoint: `${APPLE}-other` }), OTHER)
    const body = (await (await devices()).json()) as { devices: Array<Record<string, unknown>>; settings: unknown }
    expect(body.devices).toEqual([
      { id, label: 'iPhone', createdAt: expect.any(String), lastSentAt: null, lastStatus: null },
    ])
    expect(body.settings).toEqual({ mode: 'daily', timeZone: 'Europe/Madrid' })
    expect(JSON.stringify(body)).not.toContain(APPLE)
    expect(JSON.stringify(body)).not.toContain(P256DH)
  })

  it('says null for a person with no choice yet', async () => {
    expect(await (await devices()).json()).toEqual({ devices: [], settings: null })
  })

  it('forgets a device for its owner alone, and leaves the revision alone', async () => {
    const { id } = (await (await saveDevice()).json()) as { id: string }
    const before = world.token()
    expect((await call(remove, { path: '/api/push-subscriptions', method: 'DELETE', id, email: OTHER })).status).toBe(
      404,
    )
    expect((await call(remove, { path: '/api/push-subscriptions', method: 'DELETE', id: 'not-an-id' })).status).toBe(
      404,
    )
    const res = await call(remove, { path: '/api/push-subscriptions', method: 'DELETE', id })
    expect(await res.json()).toEqual({ ok: true })
    expect(rows()).toEqual([])
    expect((await call(remove, { path: '/api/push-subscriptions', method: 'DELETE', id })).status).toBe(404)
    expect(world.token()).toBe(before)
  })
})

describe('the choice', () => {
  const choose = (
    body: unknown,
    email = OWNER,
  ) => call(saveSettings, { path: '/api/push-settings', method: 'PUT', body, email })

  it('is written for the signed-in person and read back with the devices, leaving the revision alone', async () => {
    const before = world.token()
    expect(await (await choose({ mode: 'weekly', timeZone: 'America/New_York' })).json()).toEqual({ ok: true })
    expect(settingsRow()).toEqual({ mode: 'weekly', time_zone: 'America/New_York' })
    expect(settingsRow(OTHER)).toBeUndefined()
    expect(((await (await devices()).json()) as { settings: unknown }).settings).toEqual({
      mode: 'weekly',
      timeZone: 'America/New_York',
    })
    expect(world.token()).toBe(before)
  })

  it.each([
    ['a mode that is not one of the three', { mode: 'hourly', timeZone: 'UTC' }],
    ['no zone', { mode: 'daily' }],
    ['a zone nobody has heard of', { mode: 'daily', timeZone: 'Atlantis/Main' }],
    ['a body that is not an object', 'daily'],
  ])('refuses %s with 400', async (_what, body) => {
    expect((await choose(body)).status).toBe(400)
    expect(settingsRow()).toBeUndefined()
  })
})

describe('the key the app subscribes with', () => {
  const read = () => call(config, { path: '/api/push-config' })

  it('is the deployment’s VAPID public key when it looks like one, else null', async () => {
    expect(await (await read()).json()).toEqual({ publicKey: null })
    world.env.VAPID_PUBLIC_KEY = P256DH
    expect(await (await read()).json()).toEqual({ publicKey: P256DH })
    world.env.VAPID_PUBLIC_KEY = 'not a key'
    expect(await (await read()).json()).toEqual({ publicKey: null })
  })
})
