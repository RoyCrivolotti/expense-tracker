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
      'DELETE FROM capture_keys WHERE owner = ?',
      'DELETE FROM capture_cards WHERE owner = ?',
      'DELETE FROM capture_events WHERE owner = ?',
      'DELETE FROM capture_counters WHERE owner = ?',
      'DELETE FROM recommendations WHERE owner = ?',
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

describe('what a purge leaves behind', () => {
  /** Tables that name an owner and are not deleted by the purge, each with the reason nothing of the owner is left. */
  const NOT_DELETED_BY_NAME: Record<string, string> = {
    allowed_users: 'the revoke removes the person from the allow-list before the purge runs',
    user_group_grants: 'the revoke removes the grants before the purge runs',
    ledger_cells: 'kept by triggers on transactions, so deleting the transactions empties it',
    ledger_months: 'kept by triggers on transactions, so deleting the transactions empties it',
  }

  it('deletes from every table that has an owner or email column, or says why it need not', async () => {
    const db = migratedDatabase()
    const sent: string[] = []
    const d1 = sqliteD1(db)
    const batch = d1.batch.bind(d1)
    d1.batch = ((statements: Array<{ sql: string }>) => {
      sent.push(...statements.map((s) => s.sql))
      return batch(statements as never)
    }) as typeof d1.batch

    await purgeOwnerData({ DB: d1 } as unknown as Env, 'gone@example.com')

    const deleted = new Set(sent.map((sql) => /^DELETE FROM (\w+)/.exec(sql)?.[1]))
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_cf_KV'")
      .all() as { name: string }[]
    for (const { name } of tables) {
      const columns = (db.prepare(`PRAGMA table_info(${name})`).all() as { name: string }[]).map((c) => c.name)
      if (!columns.includes('owner') && !columns.includes('email')) continue
      const covered = deleted.has(name) || Boolean(NOT_DELETED_BY_NAME[name])
      expect(covered, `${name} names an owner: delete it in purgeOwnerData, or list it here with the reason it need not be`).toBe(true)
    }
  })

  it('removes capture keys, events, counters, card maps and recommendations, and only the revoked owner’s', async () => {
    const db = migratedDatabase()
    for (const owner of ['gone@example.com', 'kept@example.com']) {
      db.prepare("INSERT INTO capture_keys (key_id, owner, label, secret_hash, created_at) VALUES (?, ?, 'p', 'h', 't')").run(`k-${owner}`, owner)
      db.prepare("INSERT INTO capture_cards (owner, source, digits_kind, digits, account_id) VALUES (?, 'iberia', 'card', '0000', 1)").run(owner)
      db.prepare("INSERT INTO capture_counters (owner, source, day) VALUES (?, 'iberia', '2026-03-02')").run(owner)
      db.prepare(
        `INSERT INTO capture_events (id, owner, key_id, source, replay_key, kind, occurred_at, local_date, offset_minutes, received_at)
         VALUES (?, ?, 'k', 'iberia', 'r', 'card-purchase', 't', 'd', 0, 't')`,
      ).run(`e-${owner}`, owner)
      db.prepare("INSERT INTO recommendations (id, owner, occurred_at, local_date, created_at) VALUES (?, ?, 't', 'd', 't')").run(`r-${owner}`, owner)
    }

    await purgeOwnerData({ DB: sqliteD1(db) } as unknown as Env, 'gone@example.com')

    for (const table of ['capture_keys', 'capture_cards', 'capture_counters', 'capture_events', 'recommendations']) {
      const left = db.prepare(`SELECT owner FROM ${table}`).all()
      expect(left, table).toEqual([{ owner: 'kept@example.com' }])
    }
  })
})
