// @vitest-environment node
/**
 * GET /api/expenses/usage through the real auth middleware, the D1 adapter's SQL on SQLite with the real
 * migrations, and a database holding two owners: what it answers, how it is cached against the revision,
 * and that it counts the owner's own rows only.
 */
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Usage } from '../../../src/domain/data/usage'
import { usageFromDataset } from '../../../src/domain/engine/recordUsage'
import { randomLedger } from '../../../src/testing/randomLedger'
import { seedDataset } from '../../../src/testing/seedSqlite'
import { migratedDatabase, sqliteD1 } from '../../../src/testing/sqliteD1'
import { shifted } from '../../../src/testing/transactionQueryKit'
import { PARTS_FORMAT, partEtag } from '../../_shared/datasetEtag'
import { loadDataset } from '../../_shared/db'
import { OTHER, OWNER, createExpenseWorld, pinClock, type World } from '../../_shared/testing/expenseWorld'
import { onRequestPost as postTransaction } from './transactions/index'
import { onRequestGet } from './usage'

type Sqlite = ReturnType<typeof migratedDatabase>

let sqlite: Sqlite
let world: World

beforeEach(() => {
  pinClock('2026-10-17')
  sqlite = migratedDatabase()
  sqlite.exec('PRAGMA foreign_keys = OFF')
  world = createExpenseWorld(sqlite, sqliteD1(sqlite))
  seedDataset(sqlite, OWNER, randomLedger(21))
  seedDataset(sqlite, OTHER, shifted(randomLedger(22), 1_000_000))
})

afterEach(() => {
  vi.useRealTimers()
})

const get = (headers?: Record<string, string>, email = OWNER, path = '/usage') =>
  world.call(onRequestGet, { path, email, ...(headers ? { headers } : {}) })

describe('GET /usage', () => {
  it('serves the counts of the dataset the API serves, with the revision it was read under', async () => {
    const response = await get()
    expect(response.status).toBe(200)
    const body = (await response.json()) as Usage & { revision: string }
    const { revision, ...usage } = body
    expect(revision).toBe(world.token())
    const dataset = await loadDataset(world.env, OWNER)
    expect(usage).toEqual(usageFromDataset(dataset))
    expect(usage.categories.some((c) => c.transactions > 0)).toBe(true)
  })

  it('counts the instalments the backfill adds, as the dataset does, even when this is the first read', async () => {
    const before = sqlite.prepare('SELECT count(*) AS n FROM transactions WHERE owner = ?').get(OWNER) as { n: number }
    const usage = (await (await get()).json()) as Usage
    const after = sqlite.prepare('SELECT count(*) AS n FROM transactions WHERE owner = ?').get(OWNER) as { n: number }
    expect(after.n).toBeGreaterThan(before.n)
    const { revision, ...counts } = usage as Usage & { revision: string }
    expect(revision).toBe(world.token())
    expect(counts).toEqual(usageFromDataset(await loadDataset(world.env, OWNER)))
  })

  it('answers 401 with no signed-in user, and 400 to any parameter, the owner included', async () => {
    expect((await world.call(onRequestGet, { path: '/usage', email: '' })).status).toBe(401)
    const response = await get(undefined, OWNER, `/usage?owner=${OTHER}`)
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toBe('Unknown parameter: owner')
  })

  it('counts the owner’s own rows only', async () => {
    const mine = (await (await get()).json()) as Usage
    const theirs = (await (await get(undefined, OTHER)).json()) as Usage
    const total = (u: Usage) => u.categories.reduce((sum, c) => sum + c.transactions, 0)
    const rows = (owner: string) => (sqlite.prepare('SELECT count(*) AS n FROM transactions WHERE owner = ?').get(owner) as { n: number }).n
    expect(total(mine)).toBeLessThanOrEqual(rows(OWNER))
    expect(total(theirs)).toBeLessThanOrEqual(rows(OTHER))
    expect(mine.categories.map((c) => c.id)).not.toEqual(theirs.categories.map((c) => c.id))
  })
})

describe('caching against the revision', () => {
  it('sends a weak tag built from the revision and answers 304 to a request that holds it, counting nothing', async () => {
    const first = await get()
    const etag = first.headers.get('etag')!
    expect(etag).toBe(partEtag('usage', { token: world.token()!, budgetMonth: '2026-10' }))
    expect(first.headers.get('cache-control')).toBe('private, no-cache')

    world.clearLog()
    const again = await get({ 'if-none-match': etag })
    expect(again.status).toBe(304)
    expect(await again.text()).toBe('')
    expect(world.log.filter((sql) => /FROM transactions/i.test(sql))).toEqual([])
  })

  it('answers 200 with a new tag once a write has moved the revision, and the count has moved with it', async () => {
    const before = (await (await get()).json()) as Usage
    const etag = (await get()).headers.get('etag')!
    const category = before.categories[0]!
    const created = await world.call(postTransaction, {
      method: 'POST',
      path: '/transactions',
      body: { date: '2026-10-10', budgetMonth: '2026-10', description: 'New', accountId: before.accounts[0]!.id, categoryId: category.id, type: 'expense', amountCents: 5, cancelled: false },
    })
    expect(created.status).toBe(201)
    const after = await get({ 'if-none-match': etag })
    expect(after.status).toBe(200)
    expect(after.headers.get('etag')).not.toBe(etag)
    const usage = (await after.json()) as Usage
    expect(usage.categories.find((c) => c.id === category.id)!.transactions).toBe(category.transactions + 1)
  })

  // A browser holding a body in an older shape would get a 304 for it after a deploy. Changing the
  // shape means moving PARTS_FORMAT, which changes every part's tag, and then this.
  it('matches the shape PARTS_FORMAT was last moved for', async () => {
    const paths = new Set<string>()
    const walk = (value: unknown, path: string): void => {
      if (Array.isArray(value)) {
        paths.add(`${path}[]`)
        for (const item of value) walk(item, `${path}[]`)
      } else if (value !== null && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) walk(item, `${path}.${key}`)
      } else paths.add(`${path}:${typeof value}`)
    }
    walk(await (await get()).json(), '$')
    const fingerprint = createHash('sha256').update([...paths].sort().join('\n')).digest('hex').slice(0, 16)
    expect(
      { format: PARTS_FORMAT, fingerprint },
      'The JSON shape of GET /api/expenses/usage changed. Raise PARTS_FORMAT in datasetEtag.ts, then put the new fingerprint here.',
    ).toEqual({ format: 1, fingerprint: 'c61f12d3a2731295' })
  })
})
