import { describe, expect, it, vi } from 'vitest'
import {
  createWealthAccount,
  createWealthCheckin,
  deleteWealthAccount,
  deleteWealthCheckin,
  updateWealthAccount,
  updateWealthCheckin,
} from './dbWealth'
import type { Env } from './env'

const OWNER = 'owner@example.com'

type Row = Record<string, unknown>

/**
 * Stub Env.DB for dbWealth tests.
 * `firstMap` returns a row (or null) keyed by SQL substring match.
 * `runMap` returns meta.changes keyed by SQL substring match.
 * `allMap` returns results[] keyed by SQL substring match.
 * `batch` returns an array of {meta:{changes:1}} for each statement.
 */
function stubEnv(opts: {
  firstMap?: Record<string, Row | null>
  runMap?: Record<string, number>
  allMap?: Record<string, Row[]>
  batch?: unknown
} = {}): Env {
  const firstMap = opts.firstMap ?? {}
  const runMap = opts.runMap ?? {}
  const allMap = opts.allMap ?? {}

  function findInMap<T>(map: Record<string, T>, sql: string, fallback: T): T {
    for (const key of Object.keys(map)) {
      if (sql.includes(key)) return map[key] as T
    }
    return fallback
  }

  const batch = vi.fn(
    opts.batch ??
      ((stmts: unknown[]) => Promise.resolve(stmts.map(() => ({ meta: { changes: 1 } })))),
  )
  const prepare = vi.fn((sql: string) => ({
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    bind: (..._args: unknown[]) => ({
      first: vi.fn(async () => findInMap(firstMap, sql, null)),
      run: vi.fn(async () => ({ meta: { changes: findInMap(runMap, sql, 1) } })),
      all: vi.fn(async () => ({ results: findInMap(allMap, sql, []) })),
    }),
  }))

  return { DB: { prepare, batch } } as unknown as Env
}

// ─── Wealth Accounts ─────────────────────────────────────────────────────────

describe('createWealthAccount', () => {
  it('inserts and returns the new account', async () => {
    const env = stubEnv({
      firstMap: {
        'INSERT INTO wealth_accounts': {
          id: 1,
          name: 'Broker',
          kind: 'investment',
          sort_order: 0,
          archived: 0,
        },
      },
    })
    const result = await createWealthAccount(env, OWNER, {
      name: 'Broker',
      kind: 'investment',
      sortOrder: 0,
      archived: false,
    })
    expect(result.id).toBe(1)
    expect(result.name).toBe('Broker')
    expect(result.archived).toBe(false)
  })

  it('throws 400 for empty name', async () => {
    const env = stubEnv()
    await expect(
      createWealthAccount(env, OWNER, { name: '', kind: 'cash', sortOrder: 0, archived: false }),
    ).rejects.toMatchObject({ status: 400, message: 'Account name is required' })
  })

  it('throws 400 for invalid kind', async () => {
    const env = stubEnv()
    await expect(
      createWealthAccount(env, OWNER, {
        name: 'X',
        kind: 'bad' as never,
        sortOrder: 0,
        archived: false,
      }),
    ).rejects.toMatchObject({ status: 400, message: 'Invalid account kind' })
  })

  it('throws 500 when insert returns no row', async () => {
    const env = stubEnv({ firstMap: { 'INSERT INTO wealth_accounts': null } })
    await expect(
      createWealthAccount(env, OWNER, {
        name: 'X',
        kind: 'investment',
        sortOrder: 0,
        archived: false,
      }),
    ).rejects.toMatchObject({ status: 500 })
  })
})

describe('updateWealthAccount', () => {
  it('updates and returns the account', async () => {
    const env = stubEnv({
      firstMap: {
        'UPDATE wealth_accounts': {
          id: 1,
          name: 'Updated',
          kind: 'cash',
          sort_order: 3,
          archived: 0,
        },
      },
    })
    const result = await updateWealthAccount(env, OWNER, 1, { name: 'Updated', sortOrder: 3 })
    expect(result.name).toBe('Updated')
    expect(result.sortOrder).toBe(3)
  })

  it('throws 400 for empty patch', async () => {
    const env = stubEnv()
    await expect(updateWealthAccount(env, OWNER, 1, {})).rejects.toMatchObject({ status: 400 })
  })

  it('throws 400 for empty name in patch', async () => {
    const env = stubEnv()
    await expect(
      updateWealthAccount(env, OWNER, 1, { name: '  ' }),
    ).rejects.toMatchObject({ status: 400, message: 'Account name is required' })
  })

  it('throws 400 for invalid kind in patch', async () => {
    const env = stubEnv()
    await expect(
      updateWealthAccount(env, OWNER, 1, { kind: 'bad' as never }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('throws 404 when account not found', async () => {
    const env = stubEnv({ firstMap: { 'UPDATE wealth_accounts': null } })
    await expect(
      updateWealthAccount(env, OWNER, 99, { sortOrder: 1 }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('updates archived flag', async () => {
    const env = stubEnv({
      firstMap: {
        'UPDATE wealth_accounts': {
          id: 1,
          name: 'X',
          kind: 'investment',
          sort_order: 0,
          archived: 1,
        },
      },
    })
    const result = await updateWealthAccount(env, OWNER, 1, { archived: true })
    expect(result.archived).toBe(true)
  })
})

describe('deleteWealthAccount', () => {
  it('hard-deletes when no entries reference the account', async () => {
    const env = stubEnv({
      firstMap: { 'COUNT(*)': { n: 0 } },
      runMap: { 'DELETE FROM wealth_accounts': 1 },
    })
    await expect(deleteWealthAccount(env, OWNER, 1)).resolves.toBeUndefined()
  })

  it('soft-deletes (archives) when entries reference the account', async () => {
    const env = stubEnv({
      firstMap: {
        'COUNT(*)': { n: 3 },
        'UPDATE wealth_accounts SET archived': { id: 1 },
      },
    })
    await expect(deleteWealthAccount(env, OWNER, 1)).resolves.toBeUndefined()
  })

  it('throws 404 when soft-delete finds no row', async () => {
    const env = stubEnv({
      firstMap: {
        'COUNT(*)': { n: 1 },
        'UPDATE wealth_accounts SET archived': null,
      },
    })
    await expect(deleteWealthAccount(env, OWNER, 99)).rejects.toMatchObject({ status: 404 })
  })

  it('throws 404 when hard-delete finds no row', async () => {
    const env = stubEnv({
      firstMap: { 'COUNT(*)': { n: 0 } },
      runMap: { 'DELETE FROM wealth_accounts': 0 },
    })
    await expect(deleteWealthAccount(env, OWNER, 99)).rejects.toMatchObject({ status: 404 })
  })
})

// ─── Wealth Checkins ─────────────────────────────────────────────────────────

const CHECKIN_ROW = { id: 10, checkin_date: '2024-06-01', note: null, created_at: '2024-06-01T00:00:00' }
const ENTRY_ROW = { account_id: 1, value_cents: 50_000 }

describe('createWealthCheckin', () => {
  it('inserts and returns a check-in with entries', async () => {
    const env = stubEnv({
      firstMap: {
        'SELECT id FROM wealth_accounts': { id: 1 }, // owner-validation stub
        'INSERT INTO wealth_checkins': CHECKIN_ROW,
        'SELECT * FROM wealth_checkins WHERE id': CHECKIN_ROW,
      },
      allMap: { 'SELECT * FROM wealth_checkin_entries': [ENTRY_ROW] },
    })
    const result = await createWealthCheckin(env, OWNER, {
      checkinDate: '2024-06-01',
      entries: [{ accountId: 1, valueCents: 50_000 }],
    })
    expect(result.checkinDate).toBe('2024-06-01')
    expect(result.entries[0]!.valueCents).toBe(50_000)
  })

  it('throws 400 when entry accountId is not owned', async () => {
    const env = stubEnv({
      firstMap: { 'SELECT id FROM wealth_accounts': null }, // simulate foreign account
    })
    await expect(
      createWealthCheckin(env, OWNER, {
        checkinDate: '2024-06-01',
        entries: [{ accountId: 99, valueCents: 1_000 }],
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('deletes orphaned header when entry batch throws', async () => {
    const batchError = new Error('D1 batch failed')
    const env = stubEnv({
      firstMap: {
        'SELECT id FROM wealth_accounts': { id: 1 },
        'INSERT INTO wealth_checkins': CHECKIN_ROW,
      },
      batch: vi.fn().mockRejectedValueOnce(batchError),
    })
    await expect(
      createWealthCheckin(env, OWNER, {
        checkinDate: '2024-06-01',
        entries: [{ accountId: 1, valueCents: 50_000 }],
      }),
    ).rejects.toThrow('D1 batch failed')
    // The compensating DELETE should have been called
    const deleteCalls = (env.DB.prepare as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([sql]: [string]) => sql.startsWith('DELETE FROM wealth_checkins WHERE id'),
    )
    expect(deleteCalls.length).toBe(1)
  })

  it('throws 400 for invalid date', async () => {
    const env = stubEnv()
    await expect(
      createWealthCheckin(env, OWNER, { checkinDate: 'bad', entries: [] }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('throws 500 when insert returns no row', async () => {
    const env = stubEnv({ firstMap: { 'INSERT INTO wealth_checkins': null } })
    await expect(
      createWealthCheckin(env, OWNER, { checkinDate: '2024-06-01', entries: [] }),
    ).rejects.toMatchObject({ status: 500 })
  })

  it('skips batch when entries is empty', async () => {
    const env = stubEnv({
      firstMap: {
        'INSERT INTO wealth_checkins': CHECKIN_ROW,
        'SELECT * FROM wealth_checkins WHERE id': CHECKIN_ROW,
      },
      allMap: { 'SELECT * FROM wealth_checkin_entries': [] },
    })
    const result = await createWealthCheckin(env, OWNER, {
      checkinDate: '2024-06-01',
      entries: [],
    })
    expect(result.entries).toHaveLength(0)
  })
})

describe('updateWealthCheckin', () => {
  it('updates date and note', async () => {
    const env = stubEnv({
      firstMap: {
        'SELECT id FROM wealth_checkins': { id: 10 },
        'SELECT * FROM wealth_checkins WHERE id': {
          ...CHECKIN_ROW,
          checkin_date: '2024-07-01',
          note: 'Updated',
        },
      },
      allMap: { 'SELECT * FROM wealth_checkin_entries': [] },
    })
    const result = await updateWealthCheckin(env, OWNER, 10, {
      checkinDate: '2024-07-01',
      note: 'Updated',
    })
    expect(result.checkinDate).toBe('2024-07-01')
    expect(result.note).toBe('Updated')
  })

  it('throws 404 when checkin not found', async () => {
    const env = stubEnv({ firstMap: { 'SELECT id FROM wealth_checkins': null } })
    await expect(
      updateWealthCheckin(env, OWNER, 99, { checkinDate: '2024-01-01' }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('throws 400 for invalid date in patch', async () => {
    const env = stubEnv({
      firstMap: { 'SELECT id FROM wealth_checkins': { id: 10 } },
    })
    await expect(
      updateWealthCheckin(env, OWNER, 10, { checkinDate: 'bad' }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('replaces entries when provided', async () => {
    const env = stubEnv({
      firstMap: {
        'SELECT id FROM wealth_checkins': { id: 10 },
        'SELECT id FROM wealth_accounts': { id: 2 }, // owner-validation stub
        'SELECT * FROM wealth_checkins WHERE id': CHECKIN_ROW,
      },
      allMap: { 'SELECT * FROM wealth_checkin_entries': [ENTRY_ROW] },
    })
    const result = await updateWealthCheckin(env, OWNER, 10, {
      entries: [{ accountId: 2, valueCents: 99_000 }],
    })
    expect(result.entries[0]!.valueCents).toBe(50_000) // from allMap
  })

  it('throws 400 when entry accountId is not owned', async () => {
    const env = stubEnv({
      firstMap: {
        'SELECT id FROM wealth_checkins': { id: 10 },
        'SELECT id FROM wealth_accounts': null, // simulate foreign account
      },
    })
    await expect(
      updateWealthCheckin(env, OWNER, 10, { entries: [{ accountId: 99, valueCents: 1_000 }] }),
    ).rejects.toMatchObject({ status: 400 })
  })
})

describe('deleteWealthCheckin', () => {
  it('deletes the check-in', async () => {
    const env = stubEnv({ runMap: { 'DELETE FROM wealth_checkins': 1 } })
    await expect(deleteWealthCheckin(env, OWNER, 10)).resolves.toBeUndefined()
  })

  it('throws 404 when not found', async () => {
    const env = stubEnv({ runMap: { 'DELETE FROM wealth_checkins': 0 } })
    await expect(deleteWealthCheckin(env, OWNER, 99)).rejects.toMatchObject({ status: 404 })
  })
})
