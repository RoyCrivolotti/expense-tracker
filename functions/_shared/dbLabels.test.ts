import { describe, expect, it, vi } from 'vitest'
import { createLabel, deleteLabel, setTransactionLabels, updateLabel } from './dbLabels'
import type { Env } from './env'

interface StatementStub {
  sql: string
  args: unknown[]
}

/** Same shape as the stub in dbFlags.test.ts. */
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

const LABEL_ROW = {
  id: 1,
  name: 'Japan trip',
  color: '#10b981',
  description: null,
  sort_order: 0,
  active: 1,
}

const TXN_ROW = {
  id: 1,
  date: '2026-05-01',
  budget_month: '2026-05',
  description: 'Hotel',
  account_id: 1,
  category_id: 1,
  type: 'expense',
  amount_cents: 12_000,
  cancelled: 0,
  notes: null,
  created_at: '2026-05-01T00:00:00Z',
  plan_id: null,
  installment_index: null,
  flag_id: null,
  settled_by: null,
  report_count: null,
  report_covered_cents: null,
}

/**
 * `setTransactionLabels` re-derives its return value through dbWrite's `deriveOne`,
 * which separately queries accounts and account_statements. Returning null for both
 * takes its safe "no account found" branch (status: 'posted') without needing a
 * realistic account row just to exercise the labels logic under test here.
 */
function firstFor(reFetch: unknown) {
  return (sql: string) => {
    if (sql.includes('SELECT * FROM transactions')) return reFetch
    if (sql.includes('SELECT * FROM accounts')) return null
    if (sql.includes('account_statements')) return null
    return OK // the two ownership checks (transactions, labels)
  }
}

describe('createLabel', () => {
  it('inserts an owner-scoped row and maps it back to a Label', () => {
    let bound: unknown[] = []
    const { env } = stubEnv({
      first: (_sql, args) => {
        bound = args
        return { ...LABEL_ROW, description: 'Spring trip' }
      },
    })

    return expect(
      createLabel(env, OWNER, {
        name: 'Japan trip',
        color: '#10b981',
        description: 'Spring trip',
        sortOrder: 0,
        active: true,
      }),
    )
      .resolves.toEqual({
        id: 1,
        name: 'Japan trip',
        color: '#10b981',
        description: 'Spring trip',
        sortOrder: 0,
        active: true,
      })
      .then(() => {
        expect(bound).toEqual([OWNER, 'Japan trip', '#10b981', 'Spring trip', 0, 1])
      })
  })

  it('binds a missing description as NULL and an inactive label as 0', async () => {
    let bound: unknown[] = []
    const { env } = stubEnv({
      first: (_sql, args) => {
        bound = args
        return { ...LABEL_ROW, active: 0 }
      },
    })

    const label = await createLabel(env, OWNER, {
      name: 'Japan trip',
      color: '#10b981',
      sortOrder: 0,
      active: false,
    })

    const [, , , description, sortOrder, active] = bound
    expect(description).toBeNull()
    expect(sortOrder).toBe(0)
    expect(active).toBe(0)
    expect(label.active).toBe(false)
    expect(label.description).toBeUndefined()
  })

  it('throws when D1 returns no row', async () => {
    const { env } = stubEnv({ first: () => null })

    await expect(
      createLabel(env, OWNER, { name: 'Japan', color: '#10b981', sortOrder: 0, active: true }),
    ).rejects.toMatchObject({ status: 500, message: 'Label insert failed' })
  })
})

describe('updateLabel', () => {
  it('rejects an empty patch instead of issuing a SET-less UPDATE', async () => {
    const { env, prepare } = stubEnv({})

    await expect(updateLabel(env, OWNER, 1, {})).rejects.toMatchObject({
      status: 400,
      message: 'Empty patch',
    })
    expect(prepare).not.toHaveBeenCalled()
  })

  it('stores an empty description as NULL', async () => {
    let bound: unknown[] = []
    const { env } = stubEnv({
      first: (_sql, args) => {
        bound = args
        return LABEL_ROW
      },
    })

    await updateLabel(env, OWNER, 1, { description: '' })

    expect(bound[0]).toBeNull()
  })

  it('404s when the update matches no row for this owner', async () => {
    const { env } = stubEnv({ first: () => null })

    await expect(updateLabel(env, OWNER, 1, { name: 'Work' })).rejects.toMatchObject({
      status: 404,
      message: 'Label not found',
    })
  })
})

describe('deleteLabel', () => {
  it('clears the label from transaction_labels and deletes it in one batch', async () => {
    const { env, batch } = stubEnv({
      first: () => OK,
      batch: () => [{ meta: { changes: 3 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }],
    })

    const result = await deleteLabel(env, OWNER, 7)

    expect(batch).toHaveBeenCalledTimes(1)
    const statements = batch.mock.calls[0]?.[0] as StatementStub[]
    expect(statements.map((s) => s.sql)).toEqual([
      'DELETE FROM transaction_labels WHERE label_id = ?',
      'UPDATE flags SET auto_label_id = NULL WHERE auto_label_id = ? AND owner = ?',
      'DELETE FROM labels WHERE id = ? AND owner = ?',
    ])
    expect(result).toEqual({ unlabeled: 3 })
  })

  it('clears a flag auto-labelled with this label, so it cannot dangle', async () => {
    const { env, batch } = stubEnv({
      first: () => OK,
      batch: () => [{ meta: { changes: 0 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }],
    })

    await deleteLabel(env, OWNER, 7)

    const statements = batch.mock.calls[0]?.[0] as StatementStub[]
    expect(statements[1]?.args).toEqual([7, OWNER])
  })

  it('rejects a label the owner does not have, without writing anything', async () => {
    const { env, batch } = stubEnv({ first: () => null })

    await expect(deleteLabel(env, OWNER, 7)).rejects.toMatchObject({
      status: 400,
      message: 'Invalid labelId',
    })
    expect(batch).not.toHaveBeenCalled()
  })
})

describe('setTransactionLabels', () => {
  it('rejects a transaction id the owner does not have', async () => {
    const { env, batch } = stubEnv({ first: () => null })

    await expect(setTransactionLabels(env, OWNER, 1, [2])).rejects.toMatchObject({
      status: 400,
      message: 'Invalid transactionId',
    })
    expect(batch).not.toHaveBeenCalled()
  })

  it('rejects a labelId the owner does not have', async () => {
    // First ownership check (the transaction) passes, the second (the label) fails.
    let calls = 0
    const { env, batch } = stubEnv({
      first: () => {
        calls += 1
        return calls === 1 ? OK : null
      },
    })

    await expect(setTransactionLabels(env, OWNER, 1, [2])).rejects.toMatchObject({
      status: 400,
      message: 'Invalid labelId',
    })
    expect(batch).not.toHaveBeenCalled()
  })

  it('replaces the whole set in one batch: delete-all then insert each', async () => {
    const { env, batch } = stubEnv({ first: firstFor(TXN_ROW) })

    await setTransactionLabels(env, OWNER, 1, [2, 3])

    const statements = batch.mock.calls[0]?.[0] as StatementStub[]
    expect(statements.map((s) => s.sql)).toEqual([
      'DELETE FROM transaction_labels WHERE transaction_id = ?',
      'INSERT INTO transaction_labels (transaction_id, label_id) VALUES (?, ?)',
      'INSERT INTO transaction_labels (transaction_id, label_id) VALUES (?, ?)',
    ])
  })

  it('clears every label when given an empty array, with no INSERT statements', async () => {
    const { env, batch } = stubEnv({ first: firstFor(TXN_ROW) })

    await setTransactionLabels(env, OWNER, 1, [])

    const statements = batch.mock.calls[0]?.[0] as StatementStub[]
    expect(statements).toHaveLength(1)
    expect(statements[0]?.sql).toBe('DELETE FROM transaction_labels WHERE transaction_id = ?')
  })

  it('returns the transaction with its labelIds attached', async () => {
    const { env } = stubEnv({
      first: firstFor(TXN_ROW),
      all: () => ({ results: [{ label_id: 2 }, { label_id: 3 }] }),
    })

    const txn = await setTransactionLabels(env, OWNER, 1, [2, 3])

    expect(txn.labelIds).toEqual([2, 3])
  })

  it('404s if the transaction vanished between the ownership check and the re-fetch', async () => {
    const { env } = stubEnv({ first: firstFor(null) })

    await expect(setTransactionLabels(env, OWNER, 1, [])).rejects.toMatchObject({
      status: 404,
      message: 'Transaction not found',
    })
  })
})
