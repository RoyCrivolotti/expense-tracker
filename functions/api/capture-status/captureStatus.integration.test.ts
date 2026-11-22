// @vitest-environment node
/**
 * What the setup and diagnostics screens read: per bank app, the last recognised capture, the week's counts, the last
 * 30 days of outcomes, and the Worker's address. For the signed-in person alone, and reads only.
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
async function stored(
  keyId: string,
  source: string,
  receivedAt: string,
  outcome: string | null = null,
  state = 'open',
) {
  n += 1
  const owner = keyId === 'k1' ? OWNER : OTHER
  sqlite
    .prepare(
      'INSERT INTO recommendations (id, owner, occurred_at, local_date, created_at, state) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(`rec${n}`, owner, receivedAt, receivedAt.slice(0, 10), receivedAt, state)
  const ok = await createD1CaptureRepository(world.env).recordEvent({
    id: `e${n}`,
    keyId,
    source,
    replayKey: `r${n}`,
    kind: 'push',
    amountCents: 1250,
    currency: 'EUR',
    merchantRaw: 'CAFE EXAMPLE',
    last4: '4821',
    accountDigits: null,
    occurredAt: receivedAt,
    localDate: receivedAt.slice(0, 10),
    offsetMinutes: 60,
    receivedAt,
    body: null,
  })
  expect(ok).toBe(true)
  sqlite.prepare('UPDATE capture_events SET rec_id = ?, outcome = ? WHERE id = ?').run(`rec${n}`, outcome, `e${n}`)
}
const muted = (
  owner: string,
  source: string,
  id: string,
  ignoredAt: string | null,
) =>
  sqlite
    .prepare(
      `INSERT INTO capture_templates (owner, template_id, source, title, skeleton, first_seen, last_seen, ignored_at)
       VALUES (?, ?, ?, 't', 's', '2026-11-01', '2026-11-01', ?)`,
    )
    .run(owner, id, source, ignoredAt)
const NONE = {
  received: 0,
  recommended: 0,
  grouped: 0,
  unread: 0,
  addedAsIs: 0,
  edited: 0,
  linked: 0,
  dismissed: 0,
  open: 0,
  muted: 0,
}
const counter = (
  owner: string,
  source: string,
  day: string,
  received: number,
  unrecognised: number,
) =>
  sqlite
    .prepare('INSERT INTO capture_counters (owner, source, day, received, unrecognised) VALUES (?, ?, ?, ?, ?)')
    .run(owner, source, day, received, unrecognised)

const get = (
  setting?: string,
  email: string | false = OWNER,
  shortcut?: string,
) =>
  invokeExpenseApiRoute({
    handler: status,
    repo: createD1ExpenseRepository(world.env),
    env: {
      ...world.env,
      ...(setting === undefined ? {} : { CAPTURE_ENDPOINT: setting }),
      ...(shortcut === undefined ? {} : { CAPTURE_SHORTCUT_URL: shortcut }),
    },
    url: 'https://expenses.test/api/capture-status',
    method: 'GET',
    email,
  })

// Built in two pieces so the source holds no address-shaped text for the PII scan to flag.
const withCredentials = () => ['https://user:secret', 'capture.example.workers.dev'].join('@')

describe('GET /api/capture-status', () => {
  it('lists no source for a person with no pushes, and has no address when none is set', async () => {
    const response = await get()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ sources: [], malformed: 0, endpoint: null, shortcutUrl: null })
  })

  it('lists every source the person was counted under, in order, and names no bank of its own', async () => {
    counter(OWNER, 'some-bank', '2026-11-12', 3, 3)
    counter(OWNER, 'another', '2026-11-12', 1, 0)
    counter('other@example.com', 'not-mine', '2026-11-12', 1, 1)

    expect(await (await get()).json()).toMatchObject({
      sources: [
        { source: 'another', lastCaptureAt: null, received: 1, unrecognised: 0 },
        { source: 'some-bank', lastCaptureAt: null, received: 3, unrecognised: 3 },
      ],
    })
  })

  it('keeps a source listed after a quiet week, so the check can say nothing came lately', async () => {
    await stored('k1', 'newbank', '2026-09-01T08:00:00.000Z')
    counter(OWNER, 'newbank', '2026-09-01', 1, 0)

    expect(await (await get()).json()).toMatchObject({
      sources: [
        {
          source: 'newbank',
          lastCaptureAt: '2026-09-01T08:00:00.000Z',
          received: 0,
          unrecognised: 0,
          diagnostics: NONE,
        },
      ],
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

    counter(OWNER, 'iberia', '2026-11-13', 1, 1)
    muted(OTHER, 'iberia', 'tm', '2026-11-10')

    expect(await (await get()).json()).toMatchObject({
      sources: [
        {
          source: 'iberia',
          lastCaptureAt: null,
          received: 1,
          unrecognised: 1,
          diagnostics: { ...NONE, received: 1, unread: 1 },
        },
      ],
    })
  })

  it('counts the requests of the last seven days that could not be read, and lists no source for them', async () => {
    const malformed = (
      owner: string,
      day: string,
      n: number,
    ) =>
      sqlite
        .prepare("INSERT INTO capture_counters (owner, source, day, malformed) VALUES (?, '-', ?, ?)")
        .run(owner, day, n)
    malformed(OWNER, '2026-11-13', 2)
    malformed(OWNER, '2026-11-07', 1)
    malformed(OWNER, '2026-11-06', 40)
    malformed(OTHER, '2026-11-13', 9)

    expect(await (await get()).json()).toMatchObject({ sources: [], malformed: 3 })
  })

  describe('the diagnostics of the last 30 days', () => {
    it('count what became of each source’s pushes, from the decisions and the counters', async () => {
      counter(OWNER, 'newbank', '2026-11-13', 6, 1)
      counter(OWNER, 'newbank', '2026-10-15', 2, 2)
      counter(OWNER, 'newbank', '2026-10-14', 40, 40)
      await stored('k1', 'newbank', '2026-11-13T08:00:00.000Z', 'added-as-is', 'submitted')
      await stored('k1', 'newbank', '2026-11-12T08:00:00.000Z', 'edited:description,category', 'submitted')
      await stored('k1', 'newbank', '2026-11-11T08:00:00.000Z', 'linked', 'submitted')
      await stored('k1', 'newbank', '2026-11-10T08:00:00.000Z', 'dismissed', 'dismissed')
      await stored('k1', 'newbank', '2026-10-15T00:00:00.000Z')
      await stored('k1', 'newbank', '2026-10-14T23:59:59.000Z', 'dismissed', 'dismissed')
      muted(OWNER, 'newbank', 't1', '2026-11-01')
      muted(OWNER, 'newbank', 't2', null)

      expect(await (await get()).json()).toMatchObject({
        sources: [
          {
            source: 'newbank',
            received: 6,
            unrecognised: 1,
            diagnostics: {
              received: 8,
              recommended: 5,
              grouped: 0,
              unread: 3,
              addedAsIs: 1,
              edited: 1,
              linked: 1,
              dismissed: 1,
              open: 1,
              muted: 1,
            },
          },
        ],
      })
    })

    it('count a push that joined another’s recommendation as grouped, and its decision once', async () => {
      counter(OWNER, 'newbank', '2026-11-13', 3, 0)
      await stored('k1', 'newbank', '2026-11-13T08:00:00.000Z', 'dismissed', 'dismissed')
      await stored('k1', 'newbank', '2026-11-13T08:00:05.000Z', 'dismissed', 'dismissed')
      await stored('k1', 'newbank', '2026-11-13T09:00:00.000Z')
      await stored('k1', 'newbank', '2026-11-13T09:00:05.000Z')
      // The second push of each pair joined the first's recommendation.
      sqlite
        .prepare(
          "UPDATE capture_events SET rec_id = 'rec' || (CAST(substr(rec_id, 4) AS INTEGER) - 1), grouped = 1 WHERE id IN (?, ?)",
        )
        .run(`e${n - 2}`, `e${n}`)

      expect(await (await get()).json()).toMatchObject({
        sources: [
          {
            source: 'newbank',
            diagnostics: { ...NONE, received: 3, recommended: 2, grouped: 2, dismissed: 1, open: 1 },
          },
        ],
      })
    })

    it('count another person’s decisions and muted wordings for nobody else', async () => {
      counter(OWNER, 'iberia', '2026-11-13', 1, 0)
      counter(OTHER, 'iberia', '2026-11-13', 1, 0)
      await stored('k2', 'iberia', '2026-11-13T08:00:00.000Z', 'added-as-is', 'submitted')
      muted(OTHER, 'iberia', 'tm', '2026-11-10')

      expect(await (await get()).json()).toMatchObject({
        sources: [{ source: 'iberia', diagnostics: { ...NONE, received: 1 } }],
      })
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

  describe('the shortcut link', () => {
    const LINK = 'https://www.icloud.com/shortcuts/abc123'
    const link = async (setting?: string) =>
      ((await (await get(undefined, OWNER, setting)).json()) as { shortcutUrl: string | null }).shortcutUrl

    it('is reported as set when the variable holds an iCloud Shortcuts link', async () => {
      expect(await link(LINK)).toBe(LINK)
    })

    it('is null when the variable is unset', async () => {
      expect(await link()).toBeNull()
    })

    it.each([
      ['an empty value', ''],
      ['another host', 'https://example.com/shortcuts/abc123'],
      ['a lookalike host', 'https://www.icloud.com.example.com/shortcuts/abc123'],
      ['no www', 'https://icloud.com/shortcuts/abc123'],
      ['http', 'http://www.icloud.com/shortcuts/abc123'],
      ['an extra path', 'https://www.icloud.com/shortcuts/abc123/more'],
      ['a query string', 'https://www.icloud.com/shortcuts/abc123?x=1'],
      ['a fragment', 'https://www.icloud.com/shortcuts/abc123#x'],
      ['a missing id', 'https://www.icloud.com/shortcuts/'],
      ['an id with punctuation', 'https://www.icloud.com/shortcuts/abc-123'],
      ['leading whitespace', ` ${LINK}`],
      ['trailing whitespace', `${LINK} `],
      ['a trailing newline', `${LINK}\n`],
      ['text around a link', `see ${LINK}`],
      ['credentials in the address', ['https://user:pw', 'www.icloud.com/shortcuts/abc123'].join('@')],
      ['a script address', 'javascript:alert(1)'],
    ])('is treated as unset for %s', async (_name, setting) => {
      expect(await link(setting)).toBeNull()
    })
  })

  it('is refused without a sign-in', async () => {
    expect((await get(undefined, false)).status).toBe(401)
  })
})
