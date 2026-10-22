// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { MeasureOptions, RouteResult } from '../../functions/_shared/measure/records'
import { parseArgs } from './args'
import { execute } from './commands'
import { SYNTHETIC_OWNER } from './guard'
import { SPEND_FILE, type Deps } from './session'
import { sqliteTransport } from './sqliteTransport'
import { databaseWithAnotherOwner, seededDatabase } from './testKit'
import type { RestOptions, Transport } from './transport'

const DEV = { d1DatabaseId: 'dev-id', d1DatabaseName: 'roy-expenses-dev' }
const TOML = '[[d1_databases]]\nbinding = "DB"\ndatabase_name = "roy-expenses"\ndatabase_id = "prod-id"\n'
const CONFIRM = ['--database', 'roy-expenses-dev', '--write', '--confirm', 'roy-expenses-dev']

interface Harness {
  deps: Deps
  out: string[]
  files: Map<string, unknown>
  opened: RestOptions[]
  routes: MeasureOptions[]
}

function harness(transport: Transport, over: Partial<Deps> = {}): Harness {
  const out: string[] = []
  const files = new Map<string, unknown>()
  const opened: RestOptions[] = []
  const routes: MeasureOptions[] = []
  const deps: Deps = {
    env: { CLOUDFLARE_API_TOKEN: 'token', CLOUDFLARE_ACCOUNT_ID: 'acct' },
    now: () => new Date('2026-10-19T12:00:00Z'),
    readDevConfig: () => DEV,
    readProductionToml: () => TOML,
    files: {
      readJson: (path) => files.get(path),
      writeJson: (path, value) => void files.set(path, JSON.parse(JSON.stringify(value))),
      exists: (path) => files.has(path),
    },
    transportFor: (options) => (opened.push(options), transport),
    describe: () => Promise.resolve({ uuid: 'dev-id', name: 'roy-expenses-dev' }),
    usage: () => Promise.resolve({ rowsRead: 1000, rowsWritten: 400, byDatabase: {} }),
    print: (line) => void out.push(line),
    stopRequested: () => false,
    measureRoutes: (options) => {
      routes.push(options)
      const summary = { calls: 1, statements: 1, rowsRead: 5, rowsWritten: 0, sqlMs: 0, writes: 0 }
      const result: RouteResult = { name: 'GET stub', status: 200, bytes: 10, summary, statements: [], unexpectedWrite: false }
      return Promise.resolve([result])
    },
    ...over,
  }
  return { deps, out, files, opened, routes }
}

const run = (argv: string[], h: Harness) => execute(parseArgs(argv), h.deps)
const text = (h: Harness) => h.out.join('\n')

describe('plan', () => {
  it('prints the budget with no token and no connection', async () => {
    const h = harness(sqliteTransport(databaseWithAnotherOwner()), { env: {} })
    expect(await run(['plan'], h)).toBe(0)
    expect(text(h)).toContain('Free plan')
    expect(text(h)).toContain('The largest seed that fits')
    expect(h.opened).toHaveLength(0)
  })

  it('exits non-zero when the chosen size does not fit', async () => {
    const h = harness(sqliteTransport(databaseWithAnotherOwner()))
    expect(await run(['plan', '--transactions', '3000'], h)).toBe(1)
    expect(text(h)).toContain('OVER')
  })
})

describe('the dry runs', () => {
  it('describe a seed and a cleanup without connecting or reading a token', async () => {
    const h = harness(sqliteTransport(databaseWithAnotherOwner()), { env: {} })
    expect(await run(['seed', '--transactions', '300'], h)).toBe(0)
    expect(await run(['cleanup'], h)).toBe(0)
    expect(text(h)).toContain('dry run')
    expect(text(h)).toContain(SYNTHETIC_OWNER)
    expect(h.opened).toHaveLength(0)
    expect(h.files.size).toBe(0)
  })

  it('fail a seed dry run that is over the caps', async () => {
    const h = harness(sqliteTransport(databaseWithAnotherOwner()), { env: {} })
    expect(await run(['seed', '--transactions', '3000'], h)).toBe(1)
  })
})

describe('refusals before any statement', () => {
  const transport = () => sqliteTransport(databaseWithAnotherOwner())

  it('needs the credentials in the environment', async () => {
    const h = harness(transport(), { env: {} })
    await expect(run(['check', '--database', 'roy-expenses-dev'], h)).rejects.toThrow(/CLOUDFLARE_API_TOKEN/)
    expect(h.opened).toHaveLength(0)
  })

  it('refuses production before it reads the config or the credentials', async () => {
    const h = harness(transport(), { env: {}, readDevConfig: () => { throw new Error('config was read') } })
    await expect(run(['check', '--database', 'roy-expenses'], h)).rejects.toThrow(/production database/)
  })

  it('never opens a connection to the production database', async () => {
    const h = harness(transport())
    await expect(run(['check', '--database', 'roy-expenses'], h)).rejects.toThrow(/production/)
    await expect(run(['seed', '--database', 'roy-expenses', '--write', '--confirm', 'roy-expenses', '--snapshot', 's.json'], h)).rejects.toThrow(/production/)
    expect(h.opened).toHaveLength(0)
  })

  it('refuses when Cloudflare says the id is another database', async () => {
    const h = harness(transport(), { describe: () => Promise.resolve({ uuid: 'prod-id', name: 'roy-expenses' }) })
    await expect(run(['check', '--database', 'roy-expenses-dev'], h)).rejects.toThrow(/different database/)
  })

  it('refuses a write whose --confirm does not repeat the name', async () => {
    const h = harness(transport())
    await expect(run(['cleanup', '--database', 'roy-expenses-dev', '--write'], h)).rejects.toThrow(/--confirm/)
  })

  it('refuses a seed without a snapshot taken first', async () => {
    const h = harness(transport())
    await expect(run(['seed', ...CONFIRM], h)).rejects.toThrow(/--snapshot/)
  })

  it('refuses to write when the account has no room today', async () => {
    const h = harness(transport(), { usage: () => Promise.resolve({ rowsRead: 0, rowsWritten: 39_000, byDatabase: {} }) })
    h.files.set('snap.json', {})
    await expect(run(['seed', ...CONFIRM, '--snapshot', 'snap.json'], h)).rejects.toThrow(/account has written 39000/)
  })

  it('refuses to write when it cannot tell how much the account has used, and says what to do', async () => {
    const h = harness(transport(), { usage: () => Promise.reject(new Error('not allowed')) })
    h.files.set('snap.json', {})
    await expect(run(['seed', ...CONFIRM, '--snapshot', 'snap.json'], h)).rejects.toThrow(/--account-written-today/)
  })

  it('accepts the number read off the dashboard instead of analytics', async () => {
    const h = harness(sqliteTransport(databaseWithAnotherOwner()), { usage: () => Promise.reject(new Error('not allowed')) })
    h.files.set('snap.json', {})
    expect(await run(['seed', ...CONFIRM, '--snapshot', 'snap.json', '--transactions', '200', '--account-written-today', '300'], h)).toBe(0)
  })

  it('keeps a read-only command running when analytics are out of reach', async () => {
    const h = harness(sqliteTransport(databaseWithAnotherOwner()), { usage: () => Promise.reject(new Error('not allowed')) })
    expect(await run(['check', '--database', 'roy-expenses-dev'], h)).toBe(0)
    expect(text(h)).toContain('account today: unknown')
  })
})

describe('a whole exercise through the commands', () => {
  it('checks, snapshots, seeds, measures, cleans up and verifies, spending what it says it spends', async () => {
    const db = databaseWithAnotherOwner()
    const h = harness(sqliteTransport(db))
    const base = ['--database', 'roy-expenses-dev']

    expect(await run(['check', ...base], h)).toBe(0)
    expect(text(h)).toContain('batch through the API')
    expect(text(h)).toContain('highest transaction id')
    expect(text(h)).toContain('account today: 400 rows written')

    expect(await run(['snapshot', ...base], h)).toBe(0)
    const snapshot = [...h.files.keys()].find((k) => k.startsWith('.tmp/scaling/snapshot-'))
    expect(snapshot).toBeTruthy()

    expect(await run(['seed', ...CONFIRM, '--snapshot', snapshot as string, '--transactions', '300'], h)).toBe(0)
    expect(text(h)).toContain('first 20 transactions')
    await expect(run(['seed', ...CONFIRM, '--snapshot', snapshot as string], h)).rejects.toThrow(/already has rows/)

    expect(await run(['measure', ...base], h)).toBe(0)
    expect(h.routes[0]).toMatchObject({ owner: SYNTHETIC_OWNER, month: '2026-10', includeWrites: false })
    expect(await run(['measure', ...CONFIRM], h)).toBe(0)
    expect(h.routes[1]).toMatchObject({ includeWrites: true })
    expect([...h.files.keys()].some((k) => k.startsWith('.tmp/scaling/routes-'))).toBe(true)

    expect(await run(['cleanup', ...CONFIRM, '--transactions', '300'], h)).toBe(0)
    expect(await run(['verify', ...base, '--snapshot', snapshot as string], h)).toBe(0)
    expect(text(h)).toContain('byte-for-byte')

    const spend = h.files.get(SPEND_FILE) as { days: { written: number; read: number }[] }
    expect(spend.days).toHaveLength(1)
    expect(spend.days[0]?.written).toBeGreaterThan(300)
  })

  it('refuses to measure before a seed, and a seed spends against the same day on the next command', async () => {
    const h = harness(sqliteTransport(databaseWithAnotherOwner()))
    await expect(run(['measure', '--database', 'roy-expenses-dev'], h)).rejects.toThrow(/seed first/)
  })

  it('reports a failing route as a failed run', async () => {
    const { db } = await seededDatabase(200)
    const failing: RouteResult = { name: 'GET stub', status: 500, bytes: 0, statements: [], unexpectedWrite: false, summary: { calls: 1, statements: 1, rowsRead: 0, rowsWritten: 0, sqlMs: 0, writes: 0 } }
    const h = harness(sqliteTransport(db), { measureRoutes: () => Promise.resolve([failing]) })
    expect(await run(['measure', '--database', 'roy-expenses-dev'], h)).toBe(1)
    const wrote: RouteResult = { ...failing, status: 200, unexpectedWrite: true }
    const g = harness(sqliteTransport(db), { measureRoutes: () => Promise.resolve([wrote]) })
    expect(await run(['measure', '--database', 'roy-expenses-dev'], g)).toBe(1)
    expect(text(g)).toContain('a read wrote')
  })

  it('keeps yesterday out of today and counts it against the total', async () => {
    const h = harness(sqliteTransport(databaseWithAnotherOwner()))
    h.files.set(SPEND_FILE, { days: [{ day: '2026-10-18', read: 10, written: 24_990, statements: 3 }] })
    h.files.set('snap.json', {})
    await expect(run(['seed', ...CONFIRM, '--snapshot', 'snap.json', '--transactions', '200'], h)).rejects.toThrow(/in total/)
  })

  it('fails a cleanup that leaves rows behind and a verify that finds the synthetic owner or a change', async () => {
    const { db } = await seededDatabase(200)
    const h = harness(sqliteTransport(db))
    h.files.set('snap.json', { fingerprint: {} })
    expect(await run(['verify', '--database', 'roy-expenses-dev', '--snapshot', 'snap.json'], h)).toBe(1)
    expect(text(h)).toContain('STILL THERE: transactions')
    expect(text(h)).toContain('CHANGED:')
    await expect(run(['verify', '--database', 'roy-expenses-dev'], h)).rejects.toThrow(/--snapshot/)
  })

  it('stops a cleanup that finds rows it was not meant to leave', async () => {
    const { db } = await seededDatabase(100)
    const inner = sqliteTransport(db)
    const sloppy: Transport = { ...inner, query: (s) => (/^DELETE FROM settings/.test(s.sql) ? inner.query({ sql: 'SELECT 1', params: [] }) : inner.query(s)) }
    db.prepare('INSERT INTO settings (owner) VALUES (?)').run(SYNTHETIC_OWNER)
    const h = harness(sloppy)
    expect(await run(['cleanup', ...CONFIRM, '--transactions', '100'], h)).toBe(1)
    expect(text(h)).toContain('STILL THERE: settings')
  })
})

describe('the stop file', () => {
  it('ends a read-only command before its next statement', async () => {
    const h = harness(sqliteTransport(databaseWithAnotherOwner()), { stopRequested: () => true })
    await expect(run(['snapshot', '--database', 'roy-expenses-dev'], h)).rejects.toThrow(/stop file/)
    expect(h.files.size).toBe(0)
  })
})

describe('compare', () => {
  it('shows the growth per 1,000 transactions between two runs', async () => {
    const h = harness(sqliteTransport(databaseWithAnotherOwner()))
    const result = (read: number): RouteResult => ({ name: 'GET series', status: 200, bytes: 1, statements: [], unexpectedWrite: false, summary: { calls: 1, statements: 1, rowsRead: read, rowsWritten: 0, sqlMs: 0, writes: 0 } })
    h.files.set('a.json', { day: 'd', transactions: 300, results: [result(2_700)] })
    h.files.set('b.json', { day: 'd', transactions: 1_200, results: [result(10_800)] })
    expect(await run(['compare', 'a.json', 'b.json'], h)).toBe(0)
    expect(text(h)).toContain('GET series')
    expect(text(h)).toContain('90,000')
    await expect(run(['compare', 'a.json'], h)).rejects.toThrow(/two result files/)
  })
})
