// @vitest-environment node
// scripts/check-capture-deployed.mjs against a fake Cloudflare API shaped like the real one. Nothing reaches the network.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { main } from './check-capture-deployed.mjs'

const SHIPPED = 'a'.repeat(40)
const OLDER = 'b'.repeat(40)
const ACCOUNT = 'account-for-test'
const STAGING = 'expense-capture-stg'
const PROD = 'expense-capture'
const DATABASES = [
  { name: 'roy-expenses-dev', uuid: 'id-of-the-staging-database' },
  { name: 'roy-expenses', uuid: 'id-of-the-production-database' },
]

interface Share {
  version_id: string
  percentage: number
}

interface Binding {
  name: string
  type: string
  id?: string
  database_id?: string
}

interface FakeWorker {
  /** Newest first, as Cloudflare lists them. */
  deployments: { versions: Share[] }[]
  /** Version id to the message it was uploaded with, or null for a version with none. */
  messages: Record<string, string | null>
  /** What each version is bound to; when left out, what this Worker should have. */
  bindings?: Binding[]
}

const running = (commit: string | null): FakeWorker => ({
  deployments: [{ versions: [{ version_id: 'version-1', percentage: 100 }] }],
  messages: { 'version-1': commit },
})

/** As Cloudflare lists a version's bindings: a D1 binding carries its id twice, a secret carries no value. */
const database = (id: string): Binding => ({ name: 'DB', type: 'd1', id, database_id: id })
const secret = (name: string): Binding => ({ name, type: 'secret_text' })
const idFor = (worker: string) => DATABASES[worker === STAGING ? 0 : 1].uuid
const boundAsItShouldBe = (worker: string) => [
  secret('CAPTURE_REPLAY_SECRET'),
  database(idFor(worker)),
  secret('OWNER_EMAIL'),
]

const ok = (result: unknown) => new Response(JSON.stringify({ success: true, errors: [], result }))

const refused = (
  status: number,
  code: number,
  message: string,
) => new Response(JSON.stringify({ success: false, errors: [{ code, message }], result: null }), { status })

const missing = () => refused(404, 10007, 'This Worker does not exist on your account.')

function answer(
  name: string,
  worker: FakeWorker,
  resource: string,
): Response {
  if (resource === 'deployments') return ok({ deployments: worker.deployments })
  const id = resource.replace('versions/', '')
  const message = worker.messages[id]
  if (message === undefined) return refused(404, 10007, 'No such version')
  const annotations = { 'workers/triggered_by': 'version_upload', ...(message && { 'workers/message': message }) }
  return ok({ id, annotations, resources: { bindings: worker.bindings ?? boundAsItShouldBe(name) } })
}

function fakeApi(
  workers: Record<string, FakeWorker | (() => Response)>,
  databases: () => Response = () => ok(DATABASES),
) {
  const respond = (url: string): Response => {
    if (url.includes(`/accounts/${ACCOUNT}/d1/database?`)) return databases()
    const match = new RegExp(`/accounts/${ACCOUNT}/workers/scripts/([^/]+)/(.+)$`).exec(url)
    const worker = workers[match?.[1] ?? '']
    if (!worker) return missing()
    return typeof worker === 'function' ? worker() : answer(match![1], worker, match![2])
  }
  // The executor turns a throw from `respond` into a rejection, as fetch does when the request never arrives.
  const fetchFake = vi.fn((url: string, _init: RequestInit) => new Promise<Response>((done) => done(respond(url))))
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

async function check(env: Record<string, string> = { GITHUB_SHA: SHIPPED }) {
  const lines: string[] = []
  const code = await main({
    env: { CLOUDFLARE_ACCOUNT_ID: ACCOUNT, ...env },
    token: () => 'not-a-token',
    git: () => SHIPPED,
    log: (line: string) => lines.push(line),
  })
  return { code, lines, errors: lines.filter((line) => line.startsWith('::error::')) }
}

afterEach(() => vi.unstubAllGlobals())

describe('check-capture-deployed.mjs', () => {
  it('passes when both Workers run the shipped commit', async () => {
    fakeApi({ [STAGING]: running(SHIPPED), [PROD]: running(SHIPPED) })

    const result = await check()

    expect(result.code).toBe(0)
    expect(result.lines).toEqual([`${STAGING}: running ${SHIPPED}`, `${PROD}: running ${SHIPPED}`])
  })

  it('only reads, with the token and a time limit', async () => {
    const fetchFake = fakeApi({ [STAGING]: running(SHIPPED), [PROD]: running(SHIPPED) })

    await check()

    const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`
    expect(fetchFake.mock.calls.map(([url]) => url)).toEqual([
      `${base}/workers/scripts/${STAGING}/deployments`,
      `${base}/workers/scripts/${STAGING}/versions/version-1`,
      `${base}/d1/database?name=roy-expenses-dev&per_page=100`,
      `${base}/workers/scripts/${PROD}/deployments`,
      `${base}/workers/scripts/${PROD}/versions/version-1`,
      `${base}/d1/database?name=roy-expenses&per_page=100`,
    ])
    for (const [, init] of fetchFake.mock.calls) {
      expect(init.method).toBeUndefined()
      expect(init.headers).toMatchObject({ Authorization: 'Bearer not-a-token' })
      expect(init.signal).toBeInstanceOf(AbortSignal)
    }
  })

  it('compares with HEAD when run by hand', async () => {
    fakeApi({ [STAGING]: running(SHIPPED), [PROD]: running(SHIPPED) })

    expect((await check({})).code).toBe(0)
  })

  it.each([STAGING, PROD])('fails when %s is behind, naming both commits', async (behind) => {
    fakeApi({ [STAGING]: running(SHIPPED), [PROD]: running(SHIPPED), [behind]: running(OLDER) })

    const result = await check()

    expect(result.code).toBe(1)
    expect(result.errors).toEqual([`::error::${behind} is running a version of ${OLDER}, not ${SHIPPED}`])
  })

  it('reports both Workers when both are wrong', async () => {
    fakeApi({ [STAGING]: running(OLDER), [PROD]: running(null) })

    const result = await check()

    expect(result.code).toBe(1)
    expect(result.errors).toEqual([
      `::error::${STAGING} is running a version of ${OLDER}, not ${SHIPPED}`,
      `::error::${PROD} is running a version that names no commit, not ${SHIPPED}`,
    ])
  })

  it('does not accept the short commit', async () => {
    fakeApi({ [STAGING]: running(SHIPPED), [PROD]: running(SHIPPED.slice(0, 8)) })

    expect((await check()).code).toBe(1)
  })

  it('judges the deployment serving now, not an earlier one of the right commit', async () => {
    const rolledBack: FakeWorker = {
      deployments: [
        { versions: [{ version_id: 'old', percentage: 100 }] },
        { versions: [{ version_id: 'new', percentage: 100 }] },
      ],
      messages: { old: OLDER, new: SHIPPED },
    }
    fakeApi({ [STAGING]: running(SHIPPED), [PROD]: rolledBack })

    expect((await check()).code).toBe(1)
  })

  it.each([
    ['no deployment', { deployments: [], messages: {} }, `${PROD} has no deployment`],
    ['a deployment with no version', { deployments: [{ versions: [] }], messages: {} }, 'no version listed'],
    [
      'traffic split across two versions',
      {
        deployments: [
          {
            versions: [
              { version_id: 'the-new-one', percentage: 90 },
              { version_id: 'the-old-one', percentage: 10 },
            ],
          },
        ],
        messages: { 'the-new-one': SHIPPED, 'the-old-one': OLDER },
      },
      'the-new- at 90%, the-old- at 10%',
    ],
    [
      'a second version listed at 0%',
      {
        deployments: [
          {
            versions: [
              { version_id: 'one', percentage: 100 },
              { version_id: 'two', percentage: 0 },
            ],
          },
        ],
        messages: { one: SHIPPED, two: OLDER },
      },
      'not running one version alone',
    ],
    [
      'one version without all the traffic',
      { deployments: [{ versions: [{ version_id: 'one', percentage: 50 }] }], messages: { one: SHIPPED } },
      'one at 50%',
    ],
  ])('fails on %s', async (_what, worker: FakeWorker, said) => {
    fakeApi({ [STAGING]: running(SHIPPED), [PROD]: worker })

    const result = await check()

    expect(result.code).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain(said)
  })

  it.each([
    ['a Worker that does not exist', missing, 'This Worker does not exist'],
    ['a token without the scope', () => refused(403, 10000, 'Authentication error'), 'Authentication error'],
    ['an answer that is not JSON', () => new Response('<html>502</html>', { status: 502 }), 'could not be checked'],
    ['an answer with nothing in it', () => ok(null), 'has no deployment'],
    [
      'a request that never arrives',
      () => {
        throw new TypeError('fetch failed')
      },
      'fetch failed',
    ],
  ])('fails on %s', async (_what, respond: () => Response, said) => {
    fakeApi({ [STAGING]: running(SHIPPED), [PROD]: respond })

    const result = await check()

    expect(result.code).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain(PROD)
    expect(result.errors[0]).toContain(said)
  })

  it('fails when the current version cannot be read', async () => {
    fakeApi({ [STAGING]: running(SHIPPED), [PROD]: { ...running(SHIPPED), messages: {} } })

    const result = await check()

    expect(result.code).toBe(1)
    expect(result.errors[0]).toContain(`${PROD} could not be checked`)
  })

  const noSecret = 'has no secret CAPTURE_REPLAY_SECRET, so it refuses every push'
  const wrongDatabase = 'does not have the database roy-expenses bound as DB'

  it.each<[string, Binding[], string[]]>([
    ["the other environment's database", [secret('CAPTURE_REPLAY_SECRET'), database(idFor(STAGING))], [wrongDatabase]],
    ['no database', [secret('CAPTURE_REPLAY_SECRET')], [wrongDatabase]],
    [
      'the database under another binding name',
      [secret('CAPTURE_REPLAY_SECRET'), { ...database(idFor(PROD)), name: 'OTHER' }],
      [wrongDatabase],
    ],
    ['no replay secret, as a Worker created again has', [database(idFor(PROD))], [noSecret]],
    [
      'the replay secret as a plain variable',
      [database(idFor(PROD)), { name: 'CAPTURE_REPLAY_SECRET', type: 'plain_text' }],
      [noSecret],
    ],
    ['nothing bound', [], [wrongDatabase, noSecret]],
  ])('fails when the version has %s', async (_what, bindings, said) => {
    fakeApi({ [STAGING]: running(SHIPPED), [PROD]: { ...running(SHIPPED), bindings } })

    const result = await check()

    expect(result.code).toBe(1)
    expect(result.errors).toEqual([`::error::${said.map((text) => `${PROD} ${text}`).join('; ')}`])
  })

  it.each(['id', 'database_id'] as const)('reads a database id given only as %s', async (field) => {
    const only = (worker: string): FakeWorker => ({
      ...running(SHIPPED),
      bindings: [secret('CAPTURE_REPLAY_SECRET'), { name: 'DB', type: 'd1', [field]: idFor(worker) }],
    })
    fakeApi({ [STAGING]: only(STAGING), [PROD]: only(PROD) })

    expect((await check()).code).toBe(0)
  })

  it('fails when it cannot look the databases up', async () => {
    fakeApi({ [STAGING]: running(SHIPPED), [PROD]: running(SHIPPED) }, () =>
      refused(403, 10000, 'Authentication error'),
    )

    const result = await check()

    expect(result.code).toBe(1)
    expect(result.errors).toHaveLength(2)
    expect(result.errors[1]).toContain(`${PROD} could not be checked`)
    expect(result.errors[1]).toContain('Authentication error')
  })

  it('fails when staging and production are set to one database', async () => {
    const fetchFake = fakeApi({ [STAGING]: running(SHIPPED), [PROD]: running(SHIPPED) })

    const result = await check({ GITHUB_SHA: SHIPPED, DEV_D1_NAME: 'roy-expenses' })

    expect(result.code).toBe(1)
    expect(result.errors).toHaveLength(2)
    expect(result.errors[0]).toContain('both set to the database')
    expect(fetchFake).not.toHaveBeenCalled()
  })

  const standing = 'Both Pages projects and both capture deploy steps had already run. The check changes nothing.'

  it.each([
    ['a Worker is wrong', SHIPPED, OLDER],
    ['it cannot start', 'main', SHIPPED],
  ])('says where things stand in CI when %s, and not by hand', async (_when, commit, prod) => {
    fakeApi({ [STAGING]: running(SHIPPED), [PROD]: running(prod) })

    expect((await check({ GITHUB_SHA: commit, GITHUB_ACTIONS: 'true' })).lines).toContain(standing)
    expect((await check({ GITHUB_SHA: commit })).lines).not.toContain(standing)
  })

  it('says nothing about where things stand when it passes', async () => {
    fakeApi({ [STAGING]: running(SHIPPED), [PROD]: running(SHIPPED) })

    expect((await check({ GITHUB_SHA: SHIPPED, GITHUB_ACTIONS: 'true' })).lines).not.toContain(standing)
  })

  it('fails without a token, before asking anything', async () => {
    const fetchFake = fakeApi({})
    const lines: string[] = []

    const code = await main({
      env: { GITHUB_SHA: SHIPPED },
      token: () => null,
      log: (line: string) => lines.push(line),
    })

    expect(code).toBe(1)
    expect(lines[0]).toContain('CLOUDFLARE_API_TOKEN is not set')
    expect(fetchFake).not.toHaveBeenCalled()
  })

  it('fails when it cannot tell which commit is shipping', async () => {
    const fetchFake = fakeApi({})

    expect((await check({ GITHUB_SHA: 'main' })).code).toBe(1)
    expect(fetchFake).not.toHaveBeenCalled()
  })

  it('exits non-zero from the command line', () => {
    const home = mkdtempSync(join(tmpdir(), 'no-login-'))
    try {
      const result = spawnSync(process.execPath, [join(import.meta.dirname, 'check-capture-deployed.mjs')], {
        encoding: 'utf8',
        env: { PATH: process.env.PATH, HOME: home, GITHUB_SHA: SHIPPED },
      })

      expect(result.status).toBe(1)
      expect(result.stdout).toContain('::error::Could not check the capture Workers')
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
