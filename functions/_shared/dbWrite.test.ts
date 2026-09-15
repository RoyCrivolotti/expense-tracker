import { describe, expect, it, vi } from 'vitest'
import { insertTransaction, updateTransaction, bulkUpdateTransactions } from './dbWrite'
import type { Env } from './env'

function envWith(first: unknown): Env {
  return {
    DB: {
      prepare: () => ({
        bind: () => ({
          first: vi.fn().mockResolvedValue(first),
        }),
      }),
    },
  } as unknown as Env
}

function envForBulkUpdate(opts: {
  ownedAccount?: boolean
  ownedCategory?: boolean
  ownedSettledBy?: boolean
  /** What the UPDATE's `.run()` reports as `meta.changes`. */
  changes?: number
  /** Ids the pre-check should report as already settled by a different payment. */
  settledElsewhere?: number[]
  /** Set true by the mock if the UPDATE statement is ever prepared. */
  updateRan?: { value: boolean }
  /** Every SQL string prepared, in order, when the caller wants to inspect them. */
  prepared?: string[]
}): Env {
  const {
    ownedAccount = true,
    ownedCategory = true,
    ownedSettledBy = true,
    changes = 1,
    settledElsewhere = [],
    updateRan,
    prepared,
  } = opts
  const txnRow = {
    id: 1,
    owner: 'a@b.com',
    date: '2026-01-01',
    budget_month: '2026-01',
    description: 'Test',
    account_id: 1,
    category_id: 2,
    type: 'expense',
    amount_cents: -1000,
    cancelled: 0,
    notes: null,
    plan_id: null,
    installment_index: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
  return {
    DB: {
      // D1 runs a batch as one transaction; the stub just echoes each statement's own
      // meta, which is enough to tell the settle's changed-row count from the stamp's.
      batch: vi.fn((stmts: { meta?: { changes: number } }[]) =>
        Promise.resolve(stmts.map((s) => ({ meta: s.meta ?? { changes } }))),
      ),
      prepare: (sql: string) => ({
        bind: () => {
          prepared?.push(sql)
          if (sql.includes('accounts') && sql.includes('SELECT 1')) {
            return { first: vi.fn().mockResolvedValue(ownedAccount ? { ok: 1 } : null) }
          }
          if (sql.includes('categories') && sql.includes('SELECT 1')) {
            return { first: vi.fn().mockResolvedValue(ownedCategory ? { ok: 1 } : null) }
          }
          // assertOwnedTransaction's check for a settledBy foreign key — same
          // shape as the accounts/categories checks above, against `transactions`.
          if (sql.includes('transactions') && sql.includes('SELECT 1')) {
            return { first: vi.fn().mockResolvedValue(ownedSettledBy ? { ok: 1 } : null) }
          }
          // The conflict pre-check, before any write. Distinguished from the
          // post-update re-fetch by selecting `id` rather than `*`.
          if (sql.includes('SELECT id FROM transactions')) {
            return {
              all: vi.fn().mockResolvedValue({ results: settledElsewhere.map((id) => ({ id })) }),
            }
          }
          if (sql.includes('UPDATE transactions')) {
            if (updateRan) updateRan.value = true
            // `changes` belongs to the settle itself; the snapshot statement that rides
            // in the same batch reports its own single row.
            const settleWrite = !sql.includes('SET report_count')
            return {
              run: vi.fn().mockResolvedValue({ meta: { changes } }),
              meta: { changes: settleWrite ? changes : 1 },
            }
          }
          if (sql.includes('SELECT * FROM transactions')) {
            return { all: vi.fn().mockResolvedValue({ results: [txnRow] }) }
          }
          if (sql.includes('SELECT * FROM accounts')) {
            return { first: vi.fn().mockResolvedValue(null) }
          }
          if (sql.includes('account_statements')) {
            return { first: vi.fn().mockResolvedValue(null) }
          }
          return { first: vi.fn().mockResolvedValue(null) }
        },
      }),
    },
  } as unknown as Env
}

/**
 * The ownership check and the post-failure existence check issue identical SQL, so
 * this mock tells them apart by the bound id rather than by the statement text.
 */
function envForSettleGuard(opts: {
  targetId: number
  settledById: number
  updateMatches: boolean
  targetExists?: boolean
}): Env {
  const { targetId, settledById, updateMatches, targetExists = false } = opts
  const txnRow = {
    id: targetId,
    owner: 'a@b.com',
    date: '2026-01-01',
    budget_month: '2026-01',
    description: 'Test',
    account_id: 1,
    category_id: 2,
    type: 'expense',
    amount_cents: -1000,
    cancelled: 0,
    notes: null,
    plan_id: null,
    installment_index: null,
    settled_by: settledById,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
  return {
    DB: {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: vi.fn().mockImplementation(async () => {
            if (sql.startsWith('UPDATE transactions')) {
              return updateMatches ? txnRow : null
            }
            if (sql === 'SELECT 1 AS ok FROM transactions WHERE id = ? AND owner = ?') {
              const [checkedId] = args
              if (checkedId === settledById) return { ok: 1 }
              return targetExists ? { ok: 1 } : null
            }
            return null
          }),
        }),
      }),
    },
  } as unknown as Env
}

const baseTxn = {
  date: '2026-01-01',
  budgetMonth: '2026-01',
  description: 'Test',
  accountId: 1,
  categoryId: 2,
  type: 'expense' as const,
  amountCents: -1000,
  cancelled: false,
}

describe('owner-scoped writes', () => {
  it('insertTransaction rejects foreign accountId', async () => {
    await expect(insertTransaction(envWith(null), 'a@b.com', baseTxn)).rejects.toMatchObject({
      status: 400,
      message: 'Invalid accountId',
    })
  })

  it('insertTransaction rejects foreign categoryId', async () => {
    const env = {
      DB: {
        prepare: (sql: string) => ({
          bind: () => ({
            first: vi.fn().mockImplementation(async () => {
              if (sql.includes('categories')) return null
              return { ok: 1 }
            }),
          }),
        }),
      },
    } as unknown as Env
    await expect(insertTransaction(env, 'a@b.com', baseTxn)).rejects.toMatchObject({
      status: 400,
      message: 'Invalid categoryId',
    })
  })

  it('updateTransaction rejects foreign accountId on patch', async () => {
    await expect(
      updateTransaction(envWith(null), 'a@b.com', 5, { accountId: 99 }),
    ).rejects.toMatchObject({ status: 400, message: 'Invalid accountId' })
  })
})

describe('bulkUpdateTransactions', () => {
  it('returns empty array for empty ids', async () => {
    const result = await bulkUpdateTransactions(envWith(null), 'a@b.com', [], { categoryId: 1 })
    expect(result).toEqual([])
  })

  it('rejects foreign accountId', async () => {
    await expect(
      bulkUpdateTransactions(envForBulkUpdate({ ownedAccount: false }), 'a@b.com', [1], {
        accountId: 99,
      }),
    ).rejects.toMatchObject({ status: 400, message: 'Invalid accountId' })
  })

  it('rejects foreign categoryId', async () => {
    await expect(
      bulkUpdateTransactions(envForBulkUpdate({ ownedCategory: false }), 'a@b.com', [1], {
        categoryId: 99,
      }),
    ).rejects.toMatchObject({ status: 400, message: 'Invalid categoryId' })
  })

  it('updates and returns transactions for valid patch', async () => {
    const result = await bulkUpdateTransactions(envForBulkUpdate({}), 'a@b.com', [1], {
      categoryId: 2,
    })
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe(1)
    expect(result[0]!.status).toBe('posted')
  })

  it('stamps the payment with what it covered once the settle lands', async () => {
    const prepared: string[] = []
    await bulkUpdateTransactions(envForBulkUpdate({ prepared }), 'a@b.com', [1], { settledBy: 7 })
    expect(prepared.some((sql) => sql.includes('SET report_count'))).toBe(true)
  })

  it('sends the stamp in the same batch as the settle, so neither lands alone', async () => {
    const env = envForBulkUpdate({})
    await bulkUpdateTransactions(env, 'a@b.com', [1], { settledBy: 7 })
    const batch = env.DB.batch as unknown as ReturnType<typeof vi.fn>
    expect(batch).toHaveBeenCalledOnce()
    expect(batch.mock.calls[0]![0]).toHaveLength(2)
  })

  it('leaves the stamp alone on a patch that settles nothing', async () => {
    const prepared: string[] = []
    const env = envForBulkUpdate({ prepared })
    await bulkUpdateTransactions(env, 'a@b.com', [1], { categoryId: 2 })
    expect(prepared.some((sql) => sql.includes('SET report_count'))).toBe(false)
    const batch = env.DB.batch as unknown as ReturnType<typeof vi.fn>
    expect(batch.mock.calls[0]![0]).toHaveLength(1)
  })
})

describe('updateTransaction settledBy guard', () => {
  it('rejects a settledBy that is not owned', async () => {
    await expect(
      updateTransaction(envWith(null), 'a@b.com', 5, { settledBy: 99 }),
    ).rejects.toMatchObject({ status: 400, message: 'Invalid settledBy' })
  })

  it('throws 409 when the guard blocks the update but the row does exist', async () => {
    const env = envForSettleGuard({
      targetId: 5,
      settledById: 50,
      updateMatches: false,
      targetExists: true,
    })
    await expect(
      updateTransaction(env, 'a@b.com', 5, { settledBy: 50 }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Transaction is already settled by another reimbursement',
    })
  })

  it('throws 404 when the row genuinely does not exist — distinct from the 409 guard case', async () => {
    const env = envForSettleGuard({
      targetId: 5,
      settledById: 50,
      updateMatches: false,
      targetExists: false,
    })
    await expect(
      updateTransaction(env, 'a@b.com', 5, { settledBy: 50 }),
    ).rejects.toMatchObject({ status: 404, message: 'Transaction not found' })
  })
})

describe('bulkUpdateTransactions settledBy guard', () => {
  it('rejects a settledBy that is not owned', async () => {
    await expect(
      bulkUpdateTransactions(envForBulkUpdate({ ownedSettledBy: false }), 'a@b.com', [1], {
        settledBy: 99,
      }),
    ).rejects.toMatchObject({ status: 400, message: 'Invalid settledBy' })
  })

  it('rejects a conflicting batch before touching any row', async () => {
    // The guard clause on the UPDATE excludes a conflicting row instead of failing, so
    // deciding from the changed-row count afterwards would already have committed the
    // rows that did qualify. Nothing may be written.
    const updateRan = { value: false }
    const env = envForBulkUpdate({ settledElsewhere: [2], updateRan })

    await expect(
      bulkUpdateTransactions(env, 'a@b.com', [1, 2], { settledBy: 50 }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Some of those transactions are already settled by another reimbursement',
    })
    expect(updateRan.value).toBe(false)
  })

  it('still reports a conflict that appears between the check and the write', async () => {
    // Nothing is settled elsewhere when the pre-check runs, but the UPDATE matches
    // fewer rows than asked for — a concurrent settle. The count check is the backstop.
    await expect(
      bulkUpdateTransactions(envForBulkUpdate({ changes: 1 }), 'a@b.com', [1, 2], {
        settledBy: 50,
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('writes when no target is settled elsewhere', async () => {
    const updateRan = { value: false }
    const env = envForBulkUpdate({ changes: 2, updateRan })

    await bulkUpdateTransactions(env, 'a@b.com', [1, 2], { settledBy: 50 })

    expect(updateRan.value).toBe(true)
  })

  it('does not apply the row-count check to an ordinary bulk edit without settledBy', async () => {
    // Same partial match (1 changed of 2 requested), but with no settledBy in
    // the patch — this must still resolve, as it did before the fix.
    const result = await bulkUpdateTransactions(envForBulkUpdate({ changes: 1 }), 'a@b.com', [1, 2], {
      categoryId: 2,
    })
    expect(result).toHaveLength(1)
  })
})
