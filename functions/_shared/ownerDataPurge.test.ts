import { describe, expect, it, vi } from 'vitest'
import { migratedDatabase, sqliteD1 } from '../../src/testing/sqliteD1'
import { purgeOwnerData } from './ownerDataPurge'
import type { Env } from './env'

const ATTACHMENT_ROWS = [
  { object_key: 'o/1', thumb_key: 't/1' },
  { object_key: 'o/2', thumb_key: null },
]

function envWith(opts: { bucket?: R2Bucket | undefined; order?: string[] } = {}) {
  const order = opts.order ?? []
  const batch = vi.fn(async () => {
    order.push('d1-batch')
  })
  const prepare = vi.fn((sql: string) => ({
    sql,
    bind: vi.fn().mockReturnThis(),
    all: vi.fn(async () => {
      order.push('read-keys')
      return { results: ATTACHMENT_ROWS }
    }),
  }))
  const env = { DB: { prepare, batch }, RECEIPTS: opts.bucket } as unknown as Env
  return { env, batch, prepare, order }
}

describe('purgeOwnerData', () => {
  it('deletes all tenant tables for the owner email', async () => {
    const { env, batch } = envWith()

    await purgeOwnerData(env, 'Guest@Example.com')

    expect(batch).toHaveBeenCalledOnce()
    const statements = batch.mock.calls[0]?.[0] as Array<{ sql: string }>
    expect(statements.map((s) => s.sql)).toEqual([
      'DELETE FROM transactions WHERE owner = ?',
      'DELETE FROM account_statements WHERE owner = ?',
      'DELETE FROM cash_actuals WHERE owner = ?',
      'DELETE FROM transaction_attachments WHERE owner = ?',
      'DELETE FROM flags WHERE owner = ?',
      'DELETE FROM labels WHERE owner = ?',
      'DELETE FROM categories WHERE owner = ?',
      'DELETE FROM accounts WHERE owner = ?',
      'DELETE FROM settings WHERE owner = ?',
      'DELETE FROM goal_scenarios WHERE owner = ?',
      'DELETE FROM installment_plans WHERE owner = ?',
      'DELETE FROM wealth_checkins WHERE owner = ?',
      'DELETE FROM wealth_accounts WHERE owner = ?',
      'DELETE FROM owner_revision WHERE owner = ?',
      'DELETE FROM access_requests WHERE email = ?',
    ])
  })

  it('normalises the email before deleting', async () => {
    const { env, prepare } = envWith()

    await purgeOwnerData(env, '  Guest@Example.COM  ')

    const bound = prepare.mock.results[0]?.value as { bind: ReturnType<typeof vi.fn> }
    expect(bound.bind).toHaveBeenCalledWith('guest@example.com')
  })

  it('does nothing for a blank email', async () => {
    const { env, batch, prepare } = envWith()

    await purgeOwnerData(env, '   ')

    expect(batch).not.toHaveBeenCalled()
    expect(prepare).not.toHaveBeenCalled()
  })

  it('deletes the R2 bytes before the rows that name them', async () => {
    const order: string[] = []
    const deleted: string[][] = []
    const bucket = {
      delete: vi.fn(async (keys: string[]) => {
        order.push('r2-delete')
        deleted.push(keys)
      }),
    } as unknown as R2Bucket
    const { env } = envWith({ bucket, order })

    await purgeOwnerData(env, 'guest@example.com')

    // The attachment rows are the only record of which objects belong to this owner,
    // and the D1 batch deletes them. Reversed, the sweep finds nothing and the bytes
    // are orphaned permanently — which is the bug this ordering exists to prevent.
    expect(order).toEqual(['read-keys', 'r2-delete', 'd1-batch'])
    expect(deleted).toEqual([['o/1', 't/1', 'o/2']])
  })

  it('still purges D1 when no bucket is bound', async () => {
    const { env, batch } = envWith({ bucket: undefined })

    await purgeOwnerData(env, 'guest@example.com')

    expect(batch).toHaveBeenCalledOnce()
  })

  it('purges D1 even when the R2 delete fails', async () => {
    const bucket = {
      delete: vi.fn().mockRejectedValue(new Error('R2 down')),
    } as unknown as R2Bucket
    const { env, batch } = envWith({ bucket })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Best-effort by design: failing the revoke here would leave the user's rows,
    // and their access, in place.
    await expect(purgeOwnerData(env, 'guest@example.com')).resolves.toBeUndefined()
    expect(batch).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('guest@example.com'))
    warn.mockRestore()
  })
})

describe('purgeOwnerData against SQLite', () => {
  /** One account, category, transaction and label for `owner`, with the label applied to the transaction. */
  function seedOwner(db: ReturnType<typeof migratedDatabase>, owner: string, id: number) {
    db.prepare('INSERT INTO accounts (id, owner, name, kind, settlement) VALUES (?, ?, ?, ?, ?)').run(
      id, owner, 'Card', 'debit', 'immediate',
    )
    db.prepare('INSERT INTO categories (id, owner, name) VALUES (?, ?, ?)').run(id, owner, 'Food')
    db.prepare(
      'INSERT INTO transactions (id, owner, date, budget_month, account_id, category_id, type, amount_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, owner, '2026-10-01', '2026-10', id, id, 'expense', 1000)
    db.prepare('INSERT INTO labels (id, owner, name, color) VALUES (?, ?, ?, ?)').run(id, owner, 'Trip', '#336699')
    db.prepare('INSERT INTO transaction_labels (transaction_id, label_id) VALUES (?, ?)').run(id, id)
  }

  it("deletes a revoked owner's labels and label links and leaves another owner's alone", async () => {
    const db = migratedDatabase()
    seedOwner(db, 'gone@example.com', 1)
    seedOwner(db, 'kept@example.com', 2)

    await purgeOwnerData({ DB: sqliteD1(db) } as unknown as Env, 'gone@example.com')

    expect(db.prepare('SELECT owner FROM labels').all()).toEqual([{ owner: 'kept@example.com' }])
    // The link rows go with their transactions, not through anything the purge names.
    expect(db.prepare('SELECT label_id FROM transaction_labels').all()).toEqual([{ label_id: 2 }])
  })
})
