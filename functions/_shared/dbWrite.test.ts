import { describe, expect, it, vi } from 'vitest'
import {
  insertTransaction,
  updateTransaction,
  bulkUpdateTransactions,
  bulkInsertTransactions,
} from './dbWrite'
import type { Env } from './env'
import { AMOUNT_SIGN_MESSAGE } from '../domain/data/amountSign'

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
  /** Ids the pre-check should report as carrying a negative amount. */
  withdrawals?: number[]
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
    withdrawals = [],
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
          // The withdrawal pre-check on a type change, before any write.
          if (sql.includes('amount_cents < 0')) {
            return { all: vi.fn().mockResolvedValue({ results: withdrawals.map((id) => ({ id })) }) }
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

/**
 * The row-aware sign check reads `type, amount_cents` before the UPDATE; this stub
 * answers that read with the given row and lets the UPDATE return it unchanged.
 */
function envForSignCheck(
  row: { type: string; amountCents: number } | null,
  prepared: string[] = [],
): Env {
  const txnRow = row && {
    id: 5,
    owner: 'a@b.com',
    date: '2026-01-01',
    budget_month: '2026-01',
    description: 'Test',
    account_id: 1,
    category_id: 2,
    type: row.type,
    amount_cents: row.amountCents,
    cancelled: 0,
    notes: null,
    plan_id: null,
    installment_index: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
  return {
    DB: {
      prepare: (sql: string) => ({
        bind: () => {
          prepared.push(sql)
          return {
            first: vi.fn().mockImplementation(async () => {
              if (sql.startsWith('SELECT type, amount_cents')) {
                return txnRow && { type: txnRow.type, amount_cents: txnRow.amount_cents }
              }
              if (sql.startsWith('UPDATE transactions')) return txnRow
              return null
            }),
          }
        },
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

describe('updateTransaction amount sign against the stored row', () => {
  it('refuses a negative amount alone on a row that is not an investment', async () => {
    await expect(
      updateTransaction(envForSignCheck({ type: 'expense', amountCents: 1000 }), 'a@b.com', 5, { amountCents: -500 }),
    ).rejects.toMatchObject({ status: 400, message: AMOUNT_SIGN_MESSAGE })
  })

  it('accepts a negative amount alone on an investment row', async () => {
    const updated = await updateTransaction(
      envForSignCheck({ type: 'investment', amountCents: 1000 }),
      'a@b.com',
      5,
      { amountCents: -500 },
    )
    expect(updated.id).toBe(5)
  })

  it('refuses a type change away from investment on a withdrawal', async () => {
    await expect(
      updateTransaction(envForSignCheck({ type: 'investment', amountCents: -500 }), 'a@b.com', 5, { type: 'expense' }),
    ).rejects.toMatchObject({ status: 400, message: AMOUNT_SIGN_MESSAGE })
  })

  it('does not read the row when the patch alone settles the question', async () => {
    const prepared: string[] = []
    await updateTransaction(envForSignCheck({ type: 'expense', amountCents: 1000 }, prepared), 'a@b.com', 5, { amountCents: 500 })
    await updateTransaction(envForSignCheck({ type: 'expense', amountCents: 1000 }, prepared), 'a@b.com', 5, { type: 'investment' })
    await updateTransaction(envForSignCheck({ type: 'expense', amountCents: 1000 }, prepared), 'a@b.com', 5, {
      amountCents: -500,
      type: 'investment',
    })
    expect(prepared.some((sql) => sql.startsWith('SELECT type, amount_cents'))).toBe(false)
  })

  it('leaves a missing row to the update to report', async () => {
    await expect(
      updateTransaction(envForSignCheck(null), 'a@b.com', 5, { amountCents: -500 }),
    ).rejects.toMatchObject({ status: 404 })
  })
})

describe('bulkUpdateTransactions withdrawals', () => {
  it('refuses a type change away from investment while a target is a withdrawal, before writing', async () => {
    const updateRan = { value: false }
    await expect(
      bulkUpdateTransactions(envForBulkUpdate({ withdrawals: [1], updateRan }), 'a@b.com', [1, 2], { type: 'expense' }),
    ).rejects.toMatchObject({ status: 400, message: AMOUNT_SIGN_MESSAGE })
    expect(updateRan.value).toBe(false)
  })

  it('skips the check for a change to investment or one that leaves the type alone', async () => {
    const prepared: string[] = []
    await bulkUpdateTransactions(envForBulkUpdate({ prepared, withdrawals: [1] }), 'a@b.com', [1], { type: 'investment' })
    await bulkUpdateTransactions(envForBulkUpdate({ prepared, withdrawals: [1] }), 'a@b.com', [1], { categoryId: 2 })
    expect(prepared.some((sql) => sql.includes('amount_cents < 0'))).toBe(false)
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

/**
 * Enough of D1 for the bulk insert: ownership answers come from `owned`, and every
 * INSERT is recorded so a test can show none was attempted.
 */
function envForBulkInsert(opts: {
  ownedAccounts?: number[]
  ownedCategories?: number[]
  inserted?: number[]
}): Env {
  const { ownedAccounts = [1], ownedCategories = [2], inserted } = opts
  return {
    DB: {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => {
          // These bind (id, owner), so the id is the first argument, not the second.
          if (sql.includes('accounts') && sql.includes('SELECT 1')) {
            const id = args[0] as number
            return { first: vi.fn().mockResolvedValue(ownedAccounts.includes(id) ? { ok: 1 } : null) }
          }
          if (sql.includes('categories') && sql.includes('SELECT 1')) {
            const id = args[0] as number
            return {
              first: vi.fn().mockResolvedValue(ownedCategories.includes(id) ? { ok: 1 } : null),
            }
          }
          if (sql.includes('INSERT INTO transactions')) {
            const accountId = args[4] as number
            inserted?.push(accountId)
            return {
              first: vi.fn().mockResolvedValue({
                id: inserted?.length ?? 1,
                owner: 'a@b.com',
                date: '2026-01-01',
                budget_month: '2026-01',
                description: 'Imported',
                account_id: accountId,
                category_id: 2,
                type: 'expense',
                amount_cents: 1000,
                cancelled: 0,
                notes: null,
                plan_id: null,
                installment_index: null,
              }),
            }
          }
          return { first: vi.fn().mockResolvedValue(null), all: vi.fn().mockResolvedValue({ results: [] }) }
        },
      }),
    },
  } as unknown as Env
}

/**
 * Enough of D1 for maybeCompletePlan's own queries, layered on top of the
 * ordinary account/category/plan-link plumbing every insert/update already
 * exercises. Routed by SQL substring like the other mocks in this file;
 * `completionMaxIndex` is maybeCompletePlan's own MAX(installment_index)
 * (the one scoped `AND cancelled = 0`), distinct from resolvePlanLink's own
 * next-index MAX query (`existingMaxIndex`).
 */
function envForPlanCompletion(opts: {
  planActive?: boolean
  planTotalCount?: number
  existingMaxIndex?: number | null
  completionMaxIndex?: number | null
  returnedPlanId?: number | null
  returnedInstallmentIndex?: number | null
  prepared?: string[]
}): Env {
  const {
    planActive = true,
    planTotalCount = 3,
    existingMaxIndex = null,
    completionMaxIndex = null,
    returnedPlanId = 1,
    returnedInstallmentIndex = null,
    prepared,
  } = opts
  const txnRow = {
    id: 5,
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
    plan_id: returnedPlanId,
    installment_index: returnedInstallmentIndex,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
  return {
    DB: {
      prepare: (sql: string) => ({
        bind: () => {
          prepared?.push(sql)
          if (sql.includes('accounts') && sql.includes('SELECT 1')) {
            return { first: vi.fn().mockResolvedValue({ ok: 1 }) }
          }
          if (sql.includes('categories') && sql.includes('SELECT 1')) {
            return { first: vi.fn().mockResolvedValue({ ok: 1 }) }
          }
          if (sql.includes('installment_plans') && sql.includes('SELECT 1')) {
            return { first: vi.fn().mockResolvedValue({ ok: 1 }) } // assertOwnedPlan
          }
          if (sql.includes('start_installment_index')) {
            return { first: vi.fn().mockResolvedValue({ s: 1 }) }
          }
          if (sql.includes('MAX(installment_index)') && sql.includes('cancelled = 0')) {
            return { first: vi.fn().mockResolvedValue({ m: completionMaxIndex }) }
          }
          if (sql.includes('MAX(installment_index)')) {
            return { first: vi.fn().mockResolvedValue({ m: existingMaxIndex }) }
          }
          if (sql.includes('FROM transactions') && sql.includes('installment_index = ?')) {
            return { first: vi.fn().mockResolvedValue(null) } // no duplicate
          }
          if (sql.includes('total_count')) {
            return {
              first: vi.fn().mockResolvedValue({ t: planTotalCount, a: planActive ? 1 : 0 }),
            }
          }
          if (sql.startsWith('INSERT INTO transactions') || sql.startsWith('UPDATE transactions')) {
            return {
              first: vi.fn().mockResolvedValue(txnRow),
              run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
            }
          }
          if (sql.startsWith('UPDATE installment_plans')) {
            return { run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }) }
          }
          if (sql.includes('SELECT * FROM accounts') || sql.includes('account_statements')) {
            return { first: vi.fn().mockResolvedValue(null) }
          }
          return { first: vi.fn().mockResolvedValue(null) }
        },
      }),
    },
  } as unknown as Env
}

describe('installment plan auto-completion', () => {
  it('insertTransaction flips the plan inactive when the write reaches the final installment', async () => {
    const prepared: string[] = []
    const env = envForPlanCompletion({ planTotalCount: 3, completionMaxIndex: 3, prepared })
    await insertTransaction(env, 'a@b.com', { ...baseTxn, planId: 1, installmentIndex: 3 })
    expect(prepared.some((sql) => sql.startsWith('UPDATE installment_plans'))).toBe(true)
  })

  it('leaves the plan alone for a non-final installment', async () => {
    const prepared: string[] = []
    const env = envForPlanCompletion({ planTotalCount: 3, completionMaxIndex: 2, prepared })
    await insertTransaction(env, 'a@b.com', { ...baseTxn, planId: 1, installmentIndex: 2 })
    expect(prepared.some((sql) => sql.startsWith('UPDATE installment_plans'))).toBe(false)
  })

  it('skips the completion check entirely once the plan is already inactive', async () => {
    const prepared: string[] = []
    const env = envForPlanCompletion({ planTotalCount: 3, planActive: false, prepared })
    await insertTransaction(env, 'a@b.com', { ...baseTxn, planId: 1, installmentIndex: 3 })
    expect(
      prepared.some((sql) => sql.includes('MAX(installment_index)') && sql.includes('cancelled = 0')),
    ).toBe(false)
    expect(prepared.some((sql) => sql.startsWith('UPDATE installment_plans'))).toBe(false)
  })

  it('updateTransaction flips the plan on an un-cancel that lands on the final installment', async () => {
    const prepared: string[] = []
    const env = envForPlanCompletion({
      planTotalCount: 3,
      completionMaxIndex: 3,
      returnedPlanId: 1,
      returnedInstallmentIndex: 3,
      prepared,
    })
    await updateTransaction(env, 'a@b.com', 5, { cancelled: false })
    expect(prepared.some((sql) => sql.startsWith('UPDATE installment_plans'))).toBe(true)
  })

  it('does not query installment_plans for a patch touching neither cancelled nor planId', async () => {
    const prepared: string[] = []
    const env = envForPlanCompletion({
      planTotalCount: 3,
      returnedPlanId: 1,
      returnedInstallmentIndex: 3,
      prepared,
    })
    await updateTransaction(env, 'a@b.com', 5, { description: 'Renamed' })
    expect(prepared.some((sql) => sql.includes('installment_plans'))).toBe(false)
  })
})

describe('bulkInsertTransactions', () => {
  const row = (accountId: number, categoryId: number) => ({
    date: '2026-01-01',
    budgetMonth: '2026-01',
    description: 'Imported',
    accountId,
    categoryId,
    type: 'expense' as const,
    amountCents: 1000,
    cancelled: false,
  })

  it('writes nothing when a later row names an account the owner does not have', async () => {
    // The row that fails is the second one. Before the pre-check the first row was
    // already committed by the time it threw, so the caller was told the whole
    // import failed while half of it had landed.
    const inserted: number[] = []
    const env = envForBulkInsert({ ownedAccounts: [1], inserted })

    await expect(
      bulkInsertTransactions(env, 'a@b.com', [row(1, 2), row(99, 2)]),
    ).rejects.toThrow()

    expect(inserted).toEqual([])
  })

  it('writes nothing when a later row names a category the owner does not have', async () => {
    const inserted: number[] = []
    const env = envForBulkInsert({ ownedCategories: [2], inserted })

    await expect(
      bulkInsertTransactions(env, 'a@b.com', [row(1, 2), row(1, 77)]),
    ).rejects.toThrow()

    expect(inserted).toEqual([])
  })
})
