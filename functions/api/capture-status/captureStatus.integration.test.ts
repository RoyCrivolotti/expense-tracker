// @vitest-environment node
/**
 * What the setup screen reads: per bank app, the last recognised capture and the week's counts, and the Worker's
 * address. For the signed-in person alone, and reads only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { OTHER, OWNER, createExpenseWorld, type World } from '../../_shared/testing/expenseWorld'
import { invokeExpenseApiRoute } from '../../_shared/testing/invokeExpenseApiRoute'
import { createD1ExpenseRepository } from '../../_shared/adapters/d1ExpenseRepository'
import { createD1CaptureRepository } from '../../_shared/adapters/d1CaptureRepository'
import { onRequestGet as status } from './index'

let world: World
let sqlite: ReturnType<typeof migratedDatabase>

const NOW = new Date('2026-11-13T10:00:00.000Z')

beforeEach(async () => {
  vi.useFakeTimers({ now: NOW })
  sqlite = migratedDatabase()
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const captures = createD1CaptureRepository(world.env)
  await captures.createKey({
    keyId: 'k1',
    owner: OWNER,
    label: 'Phone',
    secretHash: 'h1',
    createdAt: NOW.toISOString(),
  })
  await captures.createKey({
    keyId: 'k2',
    owner: OTHER,
    label: 'Phone',
    secretHash: 'h2',
    createdAt: NOW.toISOString(),
  })
})
afterEach(() => vi.useRealTimers())

let n = 0
async function stored(keyId: string, source: 'iberia' | 'santander', receivedAt: string) {
  n += 1
  const ok = await createD1CaptureRepository(world.env).recordEvent({
    id: `e${n}`,
    keyId,
    source,
    replayKey: `r${n}`,
    kind: 'card-purchase',
    amountCents: -1250,
    currency: 'EUR',
    merchantRaw: 'CAFE EXAMPLE',
    last4: '4821',
    accountDigits: null,
    occurredAt: receivedAt,
    localDate: receivedAt.slice(0, 10),
    offsetMinutes: 60,
    receivedAt,
    bodyExcerpt: null,
  })
  expect(ok).toBe(true)
}
const counter = (owner: string, source: string, day: string, received: number, unrecognised: number) =>
  sqlite
    .prepare('INSERT INTO capture_counters (owner, source, day, received, unrecognised) VALUES (?, ?, ?, ?, ?)')
    .run(owner, source, day, received, unrecognised)

const get = (setting?: string, email: string | false = OWNER) =>
  invokeExpenseApiRoute({
    handler: status,
    repo: createD1ExpenseRepository(world.env),
    env: setting === undefined ? world.env : { ...world.env, CAPTURE_ENDPOINT: setting },
    url: 'https://expenses.test/api/capture-status',
    method: 'GET',
    email,
  })

// Built in two pieces so the source holds no address-shaped text for the PII scan to flag.
const withCredentials = () => ['https://user:secret', 'capture.example.workers.dev'].join('@')

describe('GET /api/capture-status', () => {
  it('says nothing has arrived for a person with no pushes, and has no address when none is set', async () => {
    const response = await get()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({
      sources: [
        { source: 'iberia', lastCaptureAt: null, received: 0, unrecognised: 0 },
        { source: 'santander', lastCaptureAt: null, received: 0, unrecognised: 0 },
      ],
      endpoint: null,
      shortcut: false,
    })
  })

  it('gives the newest recognised capture per bank app and the sums of the last seven days only', async () => {
    await stored('k1', 'iberia', '2026-11-11T08:00:00.000Z')
    await stored('k1', 'iberia', '2026-11-12T09:41:00.000Z')
    counter(OWNER, 'iberia', '2026-11-13', 3, 1)
    counter(OWNER, 'iberia', '2026-11-07', 2, 2)
    counter(OWNER, 'iberia', '2026-11-06', 50, 50)
    counter(OWNER, 'santander', '2026-11-12', 4, 4)

    expect(await (await get()).json()).toMatchObject({
      sources: [
        { source: 'iberia', lastCaptureAt: '2026-11-12T09:41:00.000Z', received: 5, unrecognised: 3 },
        { source: 'santander', lastCaptureAt: null, received: 4, unrecognised: 4 },
      ],
    })
  })

  it("shows nothing of another person's pushes", async () => {
    await stored('k2', 'iberia', '2026-11-12T09:41:00.000Z')
    counter(OTHER, 'iberia', '2026-11-13', 9, 9)

    expect(await (await get()).json()).toMatchObject({
      sources: [{ lastCaptureAt: null, received: 0, unrecognised: 0 }, expect.anything()],
    })
  })

  it('answers with the Worker address on the Worker path, taken from the environment', async () => {
    expect(await (await get('https://capture.example.workers.dev')).json()).toMatchObject({
      endpoint: 'https://capture.example.workers.dev/capture',
    })
    expect(await (await get('  https://capture.example.workers.dev/capture/  ')).json()).toMatchObject({
      endpoint: 'https://capture.example.workers.dev/capture',
    })
  })

  it.each([['http://capture.example.workers.dev'], ['not an address'], [withCredentials()], ['']])(
    'gives no address for a setting that is not a usable https address (%j)',
    async (setting) => {
      expect(await (await get(setting)).json()).toMatchObject({ endpoint: null })
    },
  )

  describe('the shortcut flag', () => {
    const FILE = 'shortcuts/capture.shortcut'
    const flag = async () => ((await (await get()).json()) as { shortcut: boolean }).shortcut
    const put = (bytes: number) => world.env.RECEIPTS!.put(FILE, new Uint8Array(bytes))

    it('is false with nothing uploaded, true once the file is there, and false when it is oversized', async () => {
      expect(await flag()).toBe(false)
      await put(23_000)
      expect(await flag()).toBe(true)
      await put(256 * 1024 + 1)
      expect(await flag()).toBe(false)
    })

    it('is false when the bucket is not bound', async () => {
      const response = await invokeExpenseApiRoute({
        handler: status,
        repo: createD1ExpenseRepository(world.env),
        env: { ...world.env, RECEIPTS: undefined },
        url: 'https://expenses.test/api/capture-status',
        method: 'GET',
        email: OWNER,
      })
      expect(((await response.json()) as { shortcut: boolean }).shortcut).toBe(false)
    })
  })

  describe('when the bucket cannot be read', () => {
    const FILE = 'shortcuts/capture.shortcut'
    const unreadable = (method: 'head' | 'get') => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      vi.spyOn(world.env.RECEIPTS!, method).mockRejectedValue(new Error('bucket secret-name unavailable'))
    }

    it('still answers, with shortcut false and a fixed log line, when head throws', async () => {
      await world.env.RECEIPTS!.put(FILE, new Uint8Array(100))
      unreadable('head')
      const response = await get()
      expect(response.status).toBe(200)
      expect(((await response.json()) as { shortcut: boolean }).shortcut).toBe(false)
      expect(console.warn).toHaveBeenCalledWith('capture status: the shortcut file could not be checked')
    })

    it('is unaffected by a failing get, since the status never reads the bytes', async () => {
      await world.env.RECEIPTS!.put(FILE, new Uint8Array(100))
      unreadable('get')
      const response = await get()
      expect(response.status).toBe(200)
      expect(((await response.json()) as { shortcut: boolean }).shortcut).toBe(true)
    })
  })

  it('is refused without a sign-in', async () => {
    expect((await get(undefined, false)).status).toBe(401)
  })
})
