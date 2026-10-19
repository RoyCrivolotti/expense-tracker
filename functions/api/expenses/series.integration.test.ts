// @vitest-environment node
/**
 * GET /api/expenses/series through the real auth middleware, the D1 adapter's SQL on SQLite with the
 * real migrations, and a database holding two owners: what it answers, how it is cached against the
 * dataset revision, that it stays the owner's own, and what it does while the normalized descriptions
 * are still being filled in.
 */
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seriesFromTransactions, type RecurringSeries } from '../../../src/domain/engine/recurringSeries'
import type { ExpenseDataset } from '../../../src/domain/types'
import { makeDataset, makeTransaction } from '../../../src/testing/factories'
import { seedDataset } from '../../../src/testing/seedSqlite'
import { migratedDatabase, sqliteD1 } from '../../../src/testing/sqliteD1'
import { syntheticAccounts, syntheticCategories } from '../../../src/testing/syntheticReference'
import { shifted } from '../../../src/testing/transactionQueryKit'
import { spelledSeries, unicodeLedger } from '../../../src/testing/unicodeLedger'
import { PARTS_FORMAT, partEtag } from '../../_shared/datasetEtag'
import { REPAIR_ALL_SQL, REVISION_RESET_SQL } from '../../_shared/descriptionNormBackfill'
import { OTHER, OWNER, createExpenseWorld, pinClock, type World } from '../../_shared/testing/expenseWorld'
import { onRequestPost as postTransaction } from './transactions/index'
import { onRequestGet } from './series'

type Sqlite = ReturnType<typeof migratedDatabase>

let sqlite: Sqlite
let world: World
let mine: ExpenseDataset

/** Everything the unicode ledger needs to exist as one owner's rows, with the accounts and categories its rows name. */
function withReference(ds: ExpenseDataset): ExpenseDataset {
  return { ...ds, accounts: syntheticAccounts(), categories: syntheticCategories() }
}

function build(seed?: { descriptionNorm: boolean }, extra: ExpenseDataset | null = null) {
  sqlite = migratedDatabase()
  sqlite.exec('PRAGMA foreign_keys = OFF')
  mine = withReference(extra ?? unicodeLedger())
  world = createExpenseWorld(sqlite, sqliteD1(sqlite))
  seedDataset(sqlite, OWNER, mine, seed)
  const theirs = shifted(
    withReference(makeDataset({ transactions: spelledSeries(1, ['Gym', 'GYM', 'gym ', ' Gym'], { amountCents: 777 }) })),
    1_000_000,
  )
  seedDataset(sqlite, OTHER, theirs, seed)
}

beforeEach(() => {
  pinClock('2026-10-17')
  build()
})

afterEach(() => {
  vi.useRealTimers()
})

const get = (headers?: Record<string, string>, email = OWNER) =>
  world.call(onRequestGet, { path: '/series', email, ...(headers ? { headers } : {}) })

const seriesOf = async (response: Response): Promise<RecurringSeries[]> =>
  ((await response.json()) as { series: RecurringSeries[] }).series

describe('GET /series', () => {
  it('serves the owner’s series, newest first, as the engine builds them from the rows', async () => {
    const response = await get()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-cache')
    const series = await seriesOf(response)
    expect(series.length).toBeGreaterThan(8)
    expect(series).toEqual(seriesFromTransactions(mine.transactions))
  })

  it('answers 401 with no signed-in user', async () => {
    expect((await world.call(onRequestGet, { path: '/series', email: '' })).status).toBe(401)
  })

  it('serves nothing from another owner, and nothing of this one to them', async () => {
    const mineSeries = await seriesOf(await get())
    const theirSeries = await seriesOf(await get(undefined, OTHER))
    expect(theirSeries).toHaveLength(1)
    expect(theirSeries[0]!.amountCents).toBe(777)
    expect(mineSeries.some((s) => s.amountCents === 777)).toBe(false)
    expect(mineSeries.map((s) => s.label)).not.toContain(' Gym')
  })

  it('does not take the owner from the request, or any parameter at all', async () => {
    const response = await world.call(onRequestGet, { path: `/series?owner=${OTHER}`, email: OWNER })
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toBe('Unknown parameter: owner')
  })

  it('carries the revision it was read under, as the ledger parts do', async () => {
    const body = (await (await get()).json()) as { revision: string }
    expect(body.revision).toBe(world.token())
  })
})

describe('caching against the dataset revision', () => {
  it('sends a weak tag built from the owner’s revision, and answers 304 to a request that holds it', async () => {
    const first = await get()
    const etag = first.headers.get('etag')!
    expect(etag).toBe(partEtag('series', { token: world.token()!, budgetMonth: '2026-10' }))
    expect(etag.startsWith('W/"')).toBe(true)

    world.clearLog()
    const again = await get({ 'if-none-match': etag })
    expect(again.status).toBe(304)
    expect(await again.text()).toBe('')
    expect(again.headers.get('etag')).toBe(etag)
    expect(again.headers.get('cache-control')).toBe('private, no-cache')
    expect(world.log.filter((sql) => /GROUP BY/.test(sql))).toEqual([])
    expect(world.log.filter((sql) => /FROM transactions/i.test(sql))).toEqual([])
  })

  it('answers 200 with a new tag once a write has moved the revision, and 304 again for the new tag', async () => {
    const first = await get()
    const etag = first.headers.get('etag')!

    const created = await world.call(postTransaction, {
      method: 'POST',
      path: '/transactions',
      body: { date: '2026-10-10', budgetMonth: '2026-10', description: 'Rent', accountId: 1, categoryId: 1, type: 'expense', amountCents: 1, cancelled: false },
    })
    expect(created.status).toBe(201)

    const after = await get({ 'if-none-match': etag })
    expect(after.status).toBe(200)
    const next = after.headers.get('etag')!
    expect(next).not.toBe(etag)
    expect((await get({ 'if-none-match': next })).status).toBe(304)
    const rent = (await seriesOf(after)).find((s) => s.label.trim().toLowerCase() === 'rent')!
    expect(rent.newestDates.at(-1)).toBe('2026-10-10')
  })

  it('does not match a tag from another owner or a wildcard', async () => {
    const theirs = (await get(undefined, OTHER)).headers.get('etag')!
    expect((await get({ 'if-none-match': theirs })).status).toBe(200)
    expect((await get({ 'if-none-match': '*' })).status).toBe(200)
  })

  // A browser holding a body in an older shape would get a 304 for it after a deploy. Changing the
  // shape means moving PARTS_FORMAT, which changes every part's tag, and then this.
  it('matches the shape PARTS_FORMAT was last moved for', async () => {
    // One series long enough to have gaps older than its newest dates, or the element type of olderGaps is never seen.
    const base = unicodeLedger()
    build(undefined, { ...base, transactions: [...base.transactions, ...spelledSeries(700, Array.from({ length: 8 }, () => 'Water bill'))] })
    const body = await (await get()).json()
    expect((body as { series: RecurringSeries[] }).series.some((s) => s.olderGaps.length > 0)).toBe(true)
    const paths = new Set<string>()
    const walk = (value: unknown, path: string): void => {
      if (Array.isArray(value)) {
        paths.add(`${path}[]`)
        for (const item of value) walk(item, `${path}[]`)
      } else if (value !== null && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) walk(item, `${path}.${key}`)
      } else paths.add(`${path}:${typeof value}`)
    }
    walk(body, '$')
    const fingerprint = createHash('sha256').update([...paths].sort().join('\n')).digest('hex').slice(0, 16)
    expect(
      { format: PARTS_FORMAT, fingerprint },
      'The JSON shape of GET /api/expenses/series changed. Raise PARTS_FORMAT in datasetEtag.ts, then put the new fingerprint here.',
    ).toEqual({ format: 1, fingerprint: '0f2007e19d1001e4' })
  })
})

describe('while descriptions are still waiting for their normalized form', () => {
  it('answers 503 and makes progress, so that retrying finishes and then answers the same as before', async () => {
    const rows = Array.from({ length: 2_200 }, (_, i) =>
      makeTransaction({ id: i + 1, description: `Shop ${i % 700}`, date: `2025-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`, budgetMonth: '2025-01', createdAt: '2025-01-01T00:00:00Z' }),
    )
    build({ descriptionNorm: false }, makeDataset({ transactions: rows }))

    const first = await get()
    expect(first.status).toBe(503)
    expect(((await first.json()) as { error: string }).error).toContain('still being built')
    expect(first.headers.get('etag')).toBeNull()
    // The client is told when to come back instead of guessing, and the answer is not kept by a cache.
    expect(first.headers.get('retry-after')).toBe('1')
    const waiting = (): number =>
      (sqlite.prepare('SELECT count(*) AS n FROM transactions WHERE owner = ? AND description_norm IS NULL').get(OWNER) as { n: number }).n
    expect(waiting()).toBeGreaterThan(0)
    expect(waiting()).toBeLessThan(2_200)

    const second = await get()
    expect(second.status).toBe(200)
    expect(waiting()).toBe(0)
    expect(await seriesOf(second)).toEqual(seriesFromTransactions(mine.transactions))
  })

  it('does not move the revision, because the column is in no response', async () => {
    build({ descriptionNorm: false })
    const waiting = (): number =>
      (sqlite.prepare('SELECT count(*) AS n FROM transactions WHERE owner = ? AND description_norm IS NULL').get(OWNER) as { n: number }).n
    // A token that exists before the first request, which is the one that fills: read afterwards it proves nothing,
    // and without a row the request itself would create one.
    sqlite.prepare('INSERT INTO owner_revision (owner, token) VALUES (?, ?)').run(OWNER, 'before-the-fill')
    expect(waiting()).toBeGreaterThan(0)
    expect((await get()).status).toBe(200)
    expect(waiting()).toBe(0)
    expect(world.token()).toBe('before-the-fill')
  })
})

describe('after code from before the column has edited a description', () => {
  /** What the previous release does: it sets the description and knows nothing of description_norm. */
  function editLikeOldCode(id: number, description: string): void {
    const info = sqlite
      .prepare("UPDATE transactions SET description = ?, updated_at = '2026-10-17 13:00:00' WHERE owner = ? AND id = ?")
      .run(description, OWNER, id)
    expect(info.changes).toBe(1)
  }

  const renamed = (): { id: number; description: string } => {
    const row = mine.transactions.find((t) => !t.cancelled && t.description.trim().length > 0)!
    return { id: row.id, description: 'Renamed by old code' }
  }

  it('keeps answering from the stale value until the documented repair is run, then answers from the rows', async () => {
    const { id, description } = renamed()
    const before = await get()
    const staleTag = before.headers.get('etag')!
    const stale = await seriesOf(before)

    editLikeOldCode(id, description)
    // Nothing moved the revision, so the browser's tag still matches and the series is the old one.
    expect((await get({ 'if-none-match': staleTag })).status).toBe(304)

    sqlite.exec(REPAIR_ALL_SQL)
    sqlite.exec(REVISION_RESET_SQL)

    const after = await get({ 'if-none-match': staleTag })
    expect(after.status).toBe(200)
    expect(after.headers.get('etag')).not.toBe(staleTag)
    const edited = mine.transactions.map((t) => (t.id === id ? { ...t, description } : t))
    const series = await seriesOf(after)
    expect(series).toEqual(seriesFromTransactions(edited))
    expect(series).not.toEqual(stale)
    expect((sqlite.prepare('SELECT count(*) AS n FROM transactions WHERE owner = ? AND description_norm IS NULL').get(OWNER) as { n: number }).n).toBe(0)
  })

  it('needs the revision reset as well as the repair: without it every browser keeps the stale body', async () => {
    const theirTag = (await get(undefined, OTHER)).headers.get('etag')!
    const myTag = (await get()).headers.get('etag')!
    const { id, description } = renamed()
    editLikeOldCode(id, description)

    sqlite.exec(REPAIR_ALL_SQL)
    expect((await get({ 'if-none-match': myTag })).status).toBe(304)
    expect((await get({ 'if-none-match': theirTag }, OTHER)).status).toBe(304)

    // The statements are database-wide, so the reset is too: each owner gets a new tag and a fresh answer.
    sqlite.exec(REVISION_RESET_SQL)
    expect((await get({ 'if-none-match': myTag })).status).toBe(200)
    const theirs = await get({ 'if-none-match': theirTag }, OTHER)
    expect(theirs.status).toBe(200)
    expect((await seriesOf(theirs))[0]!.amountCents).toBe(777)
  })
})
