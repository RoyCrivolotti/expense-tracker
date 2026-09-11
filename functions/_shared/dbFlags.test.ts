import { describe, expect, it, vi } from 'vitest'
import { createFlag, deleteFlag, setTransactionsFlag, updateFlag } from './dbFlags'
import type { Env } from './env'

interface StatementStub {
  sql: string
  args: unknown[]
}

/**
 * Same shape as the stub in dbConfig.deleteWithReassign.test.ts: mock `env.DB`
 * so we can assert the exact SQL and bound args, and in particular that the
 * delete really does go through a single `batch()`.
 */
function stubEnv(opts: {
  first?: (sql: string, args: unknown[]) => unknown
  all?: (sql: string, args: unknown[]) => { results: unknown[] }
  batch?: (stmts: StatementStub[]) => unknown[]
}) {
  const first = opts.first ?? (() => null)
  const all = opts.all ?? (() => ({ results: [] }))
  const batch = vi.fn(
    opts.batch ?? ((stmts: StatementStub[]) => stmts.map(() => ({ meta: { changes: 0 } }))),
  )
  const prepare = vi.fn((sql: string) => ({
    bind: (...args: unknown[]) => ({
      sql,
      args,
      first: vi.fn().mockImplementation(async () => first(sql, args)),
      all: vi.fn().mockImplementation(async () => all(sql, args)),
    }),
  }))
  return { env: { DB: { prepare, batch } } as unknown as Env, prepare, batch }
}

const OWNER = 'owner@example.com'
const OK = { ok: 1 }

const FLAG_ROW = {
  id: 1,
  name: 'Work travel',
  color: '#6366f1',
  description: null,
  sort_order: 0,
  active: 1,
}

describe('createFlag', () => {
  it('inserts an owner-scoped row and maps it back to a Flag', () => {
    let bound: unknown[] = []
    const { env } = stubEnv({
      first: (_sql, args) => {
        bound = args
        return { ...FLAG_ROW, description: 'Reimbursable' }
      },
    })

    return expect(
      createFlag(env, OWNER, {
        name: 'Work travel',
        color: '#6366f1',
        description: 'Reimbursable',
        sortOrder: 0,
        active: true,
      }),
    )
      .resolves.toEqual({
        id: 1,
        name: 'Work travel',
        color: '#6366f1',
        description: 'Reimbursable',
        sortOrder: 0,
        active: true,
      })
      .then(() => {
        expect(bound).toEqual([OWNER, 'Work travel', '#6366f1', 'Reimbursable', 0, 1])
      })
  })

  it('binds a missing description as NULL and an inactive flag as 0', async () => {
    let bound: unknown[] = []
    const { env } = stubEnv({
      first: (_sql, args) => {
        bound = args
        return { ...FLAG_ROW, active: 0 }
      },
    })

    const flag = await createFlag(env, OWNER, {
      name: 'Work travel',
      color: '#6366f1',
      sortOrder: 0,
      active: false,
    })

    expect(bound[3]).toBeNull()
    expect(bound[5]).toBe(0)
    expect(flag.active).toBe(false)
    expect(flag.description).toBeUndefined()
  })

  it('throws when D1 returns no row', async () => {
    const { env } = stubEnv({ first: () => null })

    await expect(
      createFlag(env, OWNER, { name: 'Work', color: '#6366f1', sortOrder: 0, active: true }),
    ).rejects.toMatchObject({ status: 500, message: 'Flag insert failed' })
  })
})

describe('deleteFlag', () => {
  it('clears the flag from transactions and deletes it in one batch, in that order', async () => {
    // Order matters: if the DELETE ran first and the batch broke, transactions
    // would be left pointing at a flag row that no longer exists.
    const { env, batch } = stubEnv({
      first: () => OK,
      batch: () => [{ meta: { changes: 3 } }, { meta: { changes: 1 } }],
    })

    const result = await deleteFlag(env, OWNER, 7)

    expect(batch).toHaveBeenCalledTimes(1)
    const statements = batch.mock.calls[0]?.[0] as StatementStub[]
    expect(statements.map((s) => s.sql)).toEqual([
      'UPDATE transactions SET flag_id = NULL WHERE flag_id = ? AND owner = ?',
      'DELETE FROM flags WHERE id = ? AND owner = ?',
    ])
    expect(result).toEqual({ unflagged: 3 })
  })

  it('scopes both statements to the owner', async () => {
    const { env, batch } = stubEnv({ first: () => OK })

    await deleteFlag(env, OWNER, 7)

    const statements = batch.mock.calls[0]?.[0] as StatementStub[]
    for (const statement of statements) {
      expect(statement.args).toEqual([7, OWNER])
    }
  })

  it('rejects a flag the owner does not have, without writing anything', async () => {
    const { env, batch } = stubEnv({ first: () => null })

    await expect(deleteFlag(env, OWNER, 7)).rejects.toMatchObject({
      status: 400,
      message: 'Invalid flagId',
    })
    expect(batch).not.toHaveBeenCalled()
  })

  it('surfaces a rejected batch rather than reporting a partial delete', async () => {
    const { env } = stubEnv({
      first: () => OK,
      batch: () => {
        throw new Error('D1 batch failed')
      },
    })

    await expect(deleteFlag(env, OWNER, 7)).rejects.toThrow('D1 batch failed')
  })
})

describe('updateFlag', () => {
  it('rejects an empty patch instead of issuing a SET-less UPDATE', async () => {
    const { env, prepare } = stubEnv({})

    await expect(updateFlag(env, OWNER, 1, {})).rejects.toMatchObject({
      status: 400,
      message: 'Empty patch',
    })
    expect(prepare).not.toHaveBeenCalled()
  })

  it('ignores keys that are not real columns', async () => {
    const { env } = stubEnv({
      first: () => ({ id: 1, name: 'Work', color: '#6366f1', description: null, sort_order: 0, active: 1 }),
    })

    const patch = { name: 'Work', id: 99 } as unknown as Parameters<typeof updateFlag>[3]
    await expect(updateFlag(env, OWNER, 1, patch)).resolves.toMatchObject({ id: 1 })
  })

  it('stores an empty description as NULL', async () => {
    let bound: unknown[] = []
    const { env } = stubEnv({
      first: (_sql, args) => {
        bound = args
        return { id: 1, name: 'Work', color: '#6366f1', description: null, sort_order: 0, active: 1 }
      },
    })

    await updateFlag(env, OWNER, 1, { description: '' })

    expect(bound[0]).toBeNull()
  })

  it('404s when the update matches no row for this owner', async () => {
    const { env } = stubEnv({ first: () => null })

    await expect(updateFlag(env, OWNER, 1, { name: 'Work' })).rejects.toMatchObject({
      status: 404,
      message: 'Flag not found',
    })
  })
})

describe('setTransactionsFlag', () => {
  it('binds one placeholder per id, owner-scoped', async () => {
    let seen: StatementStub | null = null
    const { env } = stubEnv({
      first: () => OK,
      all: (sql, args) => {
        if (sql.includes('UPDATE transactions')) seen = { sql, args }
        return { results: [] }
      },
    })

    await setTransactionsFlag(env, OWNER, [4, 5, 6], 2)

    expect(seen!.sql).toContain('IN (?, ?, ?)')
    expect(seen!.args).toEqual([2, OWNER, 4, 5, 6])
  })

  it('accepts null to clear the flag, skipping the ownership check', async () => {
    const { env, prepare } = stubEnv({ all: () => ({ results: [] }) })

    await setTransactionsFlag(env, OWNER, [1], null)

    const sqls = prepare.mock.calls.map((c) => c[0])
    expect(sqls.some((sql) => sql.includes('FROM flags'))).toBe(false)
  })

  it('rejects a flag the owner does not have', async () => {
    const { env } = stubEnv({ first: () => null })

    await expect(setTransactionsFlag(env, OWNER, [1], 9)).rejects.toMatchObject({
      status: 400,
      message: 'Invalid flagId',
    })
  })

  it('re-derives status on the rows it returns, so the client can splice them in', async () => {
    const { env } = stubEnv({
      first: () => OK,
      all: (sql) => {
        if (sql.includes('UPDATE transactions')) {
          return {
            results: [
              {
                id: 4,
                date: '2026-05-01',
                budget_month: '2026-05',
                description: 'Hotel',
                account_id: 1,
                category_id: 1,
                type: 'expense',
                amount_cents: 1_000,
                cancelled: 0,
                notes: null,
                created_at: null,
                plan_id: null,
                installment_index: null,
                flag_id: 2,
              },
            ],
          }
        }
        if (sql.includes('FROM accounts')) {
          return {
            results: [
              { id: 1, name: 'Card', kind: 'credit', settlement: 'deferred', active: 1 },
            ],
          }
        }
        return { results: [] }
      },
    })

    const rows = await setTransactionsFlag(env, OWNER, [4], 2)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 4, flagId: 2 })
    // Deferred account with no paid statement ⇒ forecast, not a hardcoded default.
    expect(rows[0]?.status).toBe('forecast')
  })

  it('skips the accounts/statements fetch when nothing matched', async () => {
    const { env, prepare } = stubEnv({ first: () => OK, all: () => ({ results: [] }) })

    await expect(setTransactionsFlag(env, OWNER, [1], 2)).resolves.toEqual([])

    const sqls = prepare.mock.calls.map((c) => c[0])
    expect(sqls.some((sql) => sql.includes('FROM accounts'))).toBe(false)
  })
})
