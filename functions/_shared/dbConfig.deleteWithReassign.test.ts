import { describe, expect, it, vi } from 'vitest'
import { deleteAccount, deleteCategory } from './dbConfig'
import type { Env } from './env'

interface StatementStub {
  sql: string
  args: unknown[]
}

/**
 * Mocks `env.DB` so tests can assert on the exact SQL + bound args sent to
 * `prepare().bind()` (direct calls) and to `batch()` (the atomic reassign+delete).
 * `first`/`run` are keyed by a substring match against the SQL text.
 */
function stubEnv(opts: {
  first?: (sql: string, args: unknown[]) => unknown
  run?: (sql: string, args: unknown[]) => { meta: { changes: number } }
  batch?: (stmts: StatementStub[]) => Promise<unknown[]> | unknown[]
}) {
  const first = opts.first ?? (() => null)
  const run = opts.run ?? (() => ({ meta: { changes: 1 } }))
  const batch = vi.fn(
    opts.batch ?? ((stmts: StatementStub[]) => stmts.map(() => ({ meta: { changes: 1 } }))),
  )
  const prepare = vi.fn((sql: string) => ({
    bind: (...args: unknown[]) => ({
      sql,
      args,
      first: vi.fn().mockImplementation(async () => first(sql, args)),
      run: vi.fn().mockImplementation(async () => run(sql, args)),
    }),
  }))
  const env = { DB: { prepare, batch } } as unknown as Env
  return { env, prepare, batch }
}

const OWNER = 'owner@example.com'

describe('deleteCategory', () => {
  it('deletes an unused category outright, without touching batch', async () => {
    const { env, batch } = stubEnv({
      first: (sql) => (sql.includes('COUNT(*)') ? { n: 0 } : null),
    })

    const result = await deleteCategory(env, OWNER, 5)

    expect(result).toEqual({ reassignedToId: null })
    expect(batch).not.toHaveBeenCalled()
  })

  it('blocks deleting a category still in use when no reassign target is given', async () => {
    const { env, batch } = stubEnv({
      first: (sql) => {
        if (sql.includes('FROM transactions')) return { n: 2 }
        if (sql.includes('FROM installment_plans')) return { n: 1 }
        return null
      },
    })

    await expect(deleteCategory(env, OWNER, 5)).rejects.toMatchObject({
      status: 409,
      message: 'Category is in use by 3 record(s)',
    })
    expect(batch).not.toHaveBeenCalled()
  })

  it('rejects specifying both reassignToId and createCategory', async () => {
    const { env, prepare } = stubEnv({})

    await expect(
      deleteCategory(env, OWNER, 5, {
        reassignToId: 7,
        createCategory: { name: 'New', monthlyBudgetCents: 0, sortOrder: 0, active: true },
      }),
    ).rejects.toMatchObject({ status: 400 })
    expect(prepare).not.toHaveBeenCalled()
  })

  it('rejects reassigning a category to itself', async () => {
    const { env, prepare } = stubEnv({})

    await expect(deleteCategory(env, OWNER, 5, { reassignToId: 5 })).rejects.toMatchObject({
      status: 400,
      message: 'Cannot reassign a category to itself',
    })
    expect(prepare).not.toHaveBeenCalled()
  })

  it('rejects a reassignToId not owned by the caller', async () => {
    const { env, batch } = stubEnv({
      first: (sql) => (sql.includes('SELECT 1 AS ok FROM categories') ? null : { n: 0 }),
    })

    await expect(deleteCategory(env, OWNER, 5, { reassignToId: 7 })).rejects.toMatchObject({
      status: 400,
      message: 'Invalid categoryId',
    })
    expect(batch).not.toHaveBeenCalled()
  })

  it('moves transactions + installment plans to the target and deletes the source atomically', async () => {
    const { env, batch } = stubEnv({
      first: (sql) => (sql.includes('SELECT 1 AS ok FROM categories') ? { ok: 1 } : null),
    })

    const result = await deleteCategory(env, OWNER, 5, { reassignToId: 7 })

    expect(result).toEqual({ reassignedToId: 7 })
    expect(batch).toHaveBeenCalledOnce()
    const stmts = batch.mock.calls[0]![0] as StatementStub[]
    expect(stmts.map((s) => s.sql)).toEqual([
      'UPDATE transactions SET category_id = ? WHERE category_id = ? AND owner = ?',
      'UPDATE installment_plans SET category_id = ? WHERE category_id = ? AND owner = ?',
      'DELETE FROM categories WHERE id = ? AND owner = ?',
    ])
    expect(stmts[0]!.args).toEqual([7, 5, OWNER])
    expect(stmts[1]!.args).toEqual([7, 5, OWNER])
    expect(stmts[2]!.args).toEqual([5, OWNER])
  })

  it('creates a new category first when createCategory is given, then reassigns to it', async () => {
    const { env, batch } = stubEnv({
      first: (sql) =>
        sql.includes('INSERT INTO categories')
          ? {
              id: 99,
              name: 'Misspelled fix',
              monthly_budget_cents: 0,
              sort_order: 0,
              icon: null,
              color: null,
              active: 1,
            }
          : null,
    })

    const result = await deleteCategory(env, OWNER, 5, {
      createCategory: { name: 'Misspelled fix', monthlyBudgetCents: 0, sortOrder: 0, active: true },
    })

    expect(result).toEqual({
      reassignedToId: 99,
      createdCategory: {
        id: 99,
        name: 'Misspelled fix',
        monthlyBudgetCents: 0,
        sortOrder: 0,
        active: true,
      },
    })
    const stmts = batch.mock.calls[0]![0] as StatementStub[]
    expect(stmts[0]!.args).toEqual([99, 5, OWNER])
  })

  it('best-effort deletes the just-created category if the reassign+delete batch then fails', async () => {
    const runCalls: { sql: string; args: unknown[] }[] = []
    const { env } = stubEnv({
      first: (sql) =>
        sql.includes('INSERT INTO categories')
          ? {
              id: 99,
              name: 'Misspelled fix',
              monthly_budget_cents: 0,
              sort_order: 0,
              icon: null,
              color: null,
              active: 1,
            }
          : null,
      run: (sql, args) => {
        runCalls.push({ sql, args })
        return { meta: { changes: 1 } }
      },
      batch: () => {
        throw new Error('D1_ERROR: batch failed')
      },
    })

    await expect(
      deleteCategory(env, OWNER, 5, {
        createCategory: { name: 'Misspelled fix', monthlyBudgetCents: 0, sortOrder: 0, active: true },
      }),
    ).rejects.toThrow('D1_ERROR: batch failed')

    expect(runCalls).toContainEqual({
      sql: 'DELETE FROM categories WHERE id = ? AND owner = ?',
      args: [99, OWNER],
    })
  })

  it('still surfaces the original batch error even if the best-effort cleanup delete itself fails', async () => {
    const { env } = stubEnv({
      first: (sql) =>
        sql.includes('INSERT INTO categories')
          ? {
              id: 99,
              name: 'Misspelled fix',
              monthly_budget_cents: 0,
              sort_order: 0,
              icon: null,
              color: null,
              active: 1,
            }
          : null,
      run: () => {
        throw new Error('cleanup delete failed too')
      },
      batch: () => {
        throw new Error('D1_ERROR: batch failed')
      },
    })

    await expect(
      deleteCategory(env, OWNER, 5, {
        createCategory: { name: 'Misspelled fix', monthlyBudgetCents: 0, sortOrder: 0, active: true },
      }),
    ).rejects.toThrow('D1_ERROR: batch failed')
  })

  it('surfaces 404 when the source category is already gone by delete time', async () => {
    const { env } = stubEnv({
      first: (sql) => (sql.includes('SELECT 1 AS ok FROM categories') ? { ok: 1 } : null),
      batch: (stmts) => stmts.map((_, i) => ({ meta: { changes: i === stmts.length - 1 ? 0 : 1 } })),
    })

    await expect(deleteCategory(env, OWNER, 5, { reassignToId: 7 })).rejects.toMatchObject({
      status: 404,
      message: 'Category not found',
    })
  })

  it('propagates a batch failure as a single all-or-nothing call (no partial writes)', async () => {
    const { env, batch } = stubEnv({
      first: (sql) => (sql.includes('SELECT 1 AS ok FROM categories') ? { ok: 1 } : null),
      batch: () => {
        throw new Error('D1_ERROR: batch failed')
      },
    })

    await expect(deleteCategory(env, OWNER, 5, { reassignToId: 7 })).rejects.toThrow(
      'D1_ERROR: batch failed',
    )
    expect(batch).toHaveBeenCalledOnce()
  })
})

describe('deleteAccount', () => {
  it('deletes an unused account outright, clearing settings.defaultAccountId if it pointed here', async () => {
    const { env, batch } = stubEnv({
      first: (sql) => (sql.includes('COUNT(*)') ? { n: 0 } : null),
    })

    const result = await deleteAccount(env, OWNER, 3)

    expect(result).toEqual({ reassignedToId: null })
    expect(batch).toHaveBeenCalledOnce()
    const stmts = batch.mock.calls[0]![0] as StatementStub[]
    expect(stmts.map((s) => s.sql)).toEqual([
      'UPDATE settings SET default_account_id = NULL WHERE owner = ? AND default_account_id = ?',
      'DELETE FROM accounts WHERE id = ? AND owner = ?',
    ])
    expect(stmts[0]!.args).toEqual([OWNER, 3])
  })

  it('blocks deleting an account still in use, counting transactions, plans, and statements', async () => {
    const { env, batch } = stubEnv({
      first: (sql) => {
        if (sql.includes('FROM transactions')) return { n: 1 }
        if (sql.includes('FROM installment_plans')) return { n: 1 }
        if (sql.includes('FROM account_statements')) return { n: 2 }
        return null
      },
    })

    await expect(deleteAccount(env, OWNER, 3)).rejects.toMatchObject({
      status: 409,
      message: 'Account is in use by 4 record(s)',
    })
    expect(batch).not.toHaveBeenCalled()
  })

  it('rejects specifying both reassignToId and createAccount', async () => {
    const { env, prepare } = stubEnv({})

    await expect(
      deleteAccount(env, OWNER, 3, {
        reassignToId: 8,
        createAccount: { name: 'New', kind: 'debit', settlement: 'immediate', active: true },
      }),
    ).rejects.toMatchObject({ status: 400 })
    expect(prepare).not.toHaveBeenCalled()
  })

  it('rejects reassigning an account to itself', async () => {
    const { env, prepare } = stubEnv({})

    await expect(deleteAccount(env, OWNER, 3, { reassignToId: 3 })).rejects.toMatchObject({
      status: 400,
      message: 'Cannot reassign an account to itself',
    })
    expect(prepare).not.toHaveBeenCalled()
  })

  it('rejects a reassignToId not owned by the caller', async () => {
    const { env, batch } = stubEnv({
      first: (sql) => (sql.includes('SELECT 1 AS ok FROM accounts') ? null : { n: 0 }),
    })

    await expect(deleteAccount(env, OWNER, 3, { reassignToId: 8 })).rejects.toMatchObject({
      status: 400,
      message: 'Invalid accountId',
    })
    expect(batch).not.toHaveBeenCalled()
  })

  it('moves transactions, plans and statements to the target and deletes the source atomically', async () => {
    const { env, batch } = stubEnv({
      first: (sql) => (sql.includes('SELECT 1 AS ok FROM accounts') ? { ok: 1 } : null),
    })

    const result = await deleteAccount(env, OWNER, 3, { reassignToId: 8 })

    expect(result).toEqual({ reassignedToId: 8 })
    expect(batch).toHaveBeenCalledOnce()
    const stmts = batch.mock.calls[0]![0] as StatementStub[]
    expect(stmts.map((s) => s.sql)).toEqual([
      'UPDATE transactions SET account_id = ? WHERE account_id = ? AND owner = ?',
      'UPDATE installment_plans SET account_id = ? WHERE account_id = ? AND owner = ?',
      expect.stringContaining('DELETE FROM account_statements'),
      'UPDATE account_statements SET account_id = ? WHERE account_id = ? AND owner = ?',
      'UPDATE settings SET default_account_id = ? WHERE owner = ? AND default_account_id = ?',
      'DELETE FROM accounts WHERE id = ? AND owner = ?',
    ])
    expect(stmts[0]!.args).toEqual([8, 3, OWNER])
    expect(stmts[2]!.args).toEqual([OWNER, 3, OWNER, 8])
    expect(stmts[3]!.args).toEqual([8, 3, OWNER])
    expect(stmts[4]!.args).toEqual([8, OWNER, 3])
    expect(stmts[5]!.args).toEqual([3, OWNER])
  })

  it("moves settings.defaultAccountId to the reassign target when it pointed at the deleted account", async () => {
    const { env, batch } = stubEnv({
      first: (sql) => (sql.includes('SELECT 1 AS ok FROM accounts') ? { ok: 1 } : null),
    })

    await deleteAccount(env, OWNER, 3, { reassignToId: 8 })

    const stmts = batch.mock.calls[0]![0] as StatementStub[]
    const settingsStmt = stmts.find((s) => s.sql.startsWith('UPDATE settings'))
    expect(settingsStmt).toBeDefined()
    // The statement is unconditional (WHERE default_account_id = ?), so it's a no-op
    // when the deleted account wasn't the default — no need to check first.
    expect(settingsStmt!.args).toEqual([8, OWNER, 3])
  })

  it('drops the source statement first for months that collide with the target (target wins)', async () => {
    const { env, batch } = stubEnv({
      first: (sql) => (sql.includes('SELECT 1 AS ok FROM accounts') ? { ok: 1 } : null),
    })

    await deleteAccount(env, OWNER, 3, { reassignToId: 8 })

    const stmts = batch.mock.calls[0]![0] as StatementStub[]
    const conflictDeleteIndex = stmts.findIndex((s) => s.sql.includes('DELETE FROM account_statements'))
    const migrateIndex = stmts.findIndex((s) =>
      s.sql.startsWith('UPDATE account_statements SET account_id'),
    )
    expect(conflictDeleteIndex).toBeGreaterThanOrEqual(0)
    expect(migrateIndex).toBeGreaterThan(conflictDeleteIndex)
  })

  it('creates a new account first when createAccount is given, then reassigns to it', async () => {
    const { env, batch } = stubEnv({
      first: (sql) =>
        sql.includes('INSERT INTO accounts')
          ? { id: 42, name: 'Fixed name', kind: 'credit', settlement: 'deferred', active: 1 }
          : null,
    })

    const result = await deleteAccount(env, OWNER, 3, {
      createAccount: { name: 'Fixed name', kind: 'credit', settlement: 'deferred', active: true },
    })

    expect(result).toEqual({
      reassignedToId: 42,
      createdAccount: { id: 42, name: 'Fixed name', kind: 'credit', settlement: 'deferred', active: true },
    })
    const stmts = batch.mock.calls[0]![0] as StatementStub[]
    expect(stmts[0]!.args).toEqual([42, 3, OWNER])
  })

  it('best-effort deletes the just-created account if the reassign+delete batch then fails', async () => {
    const runCalls: { sql: string; args: unknown[] }[] = []
    const { env } = stubEnv({
      first: (sql) =>
        sql.includes('INSERT INTO accounts')
          ? { id: 42, name: 'Fixed name', kind: 'credit', settlement: 'deferred', active: 1 }
          : null,
      run: (sql, args) => {
        runCalls.push({ sql, args })
        return { meta: { changes: 1 } }
      },
      batch: () => {
        throw new Error('D1_ERROR: batch failed')
      },
    })

    await expect(
      deleteAccount(env, OWNER, 3, {
        createAccount: { name: 'Fixed name', kind: 'credit', settlement: 'deferred', active: true },
      }),
    ).rejects.toThrow('D1_ERROR: batch failed')

    expect(runCalls).toContainEqual({
      sql: 'DELETE FROM accounts WHERE id = ? AND owner = ?',
      args: [42, OWNER],
    })
  })

  it('surfaces 404 when the source account is already gone by delete time', async () => {
    const { env } = stubEnv({
      first: (sql) => (sql.includes('SELECT 1 AS ok FROM accounts') ? { ok: 1 } : null),
      batch: (stmts) => stmts.map((_, i) => ({ meta: { changes: i === stmts.length - 1 ? 0 : 1 } })),
    })

    await expect(deleteAccount(env, OWNER, 3, { reassignToId: 8 })).rejects.toMatchObject({
      status: 404,
      message: 'Account not found',
    })
  })

  it('propagates a batch failure as a single all-or-nothing call (no partial writes)', async () => {
    const { env, batch } = stubEnv({
      first: (sql) => (sql.includes('SELECT 1 AS ok FROM accounts') ? { ok: 1 } : null),
      batch: () => {
        throw new Error('D1_ERROR: batch failed')
      },
    })

    await expect(deleteAccount(env, OWNER, 3, { reassignToId: 8 })).rejects.toThrow(
      'D1_ERROR: batch failed',
    )
    expect(batch).toHaveBeenCalledOnce()
  })
})
