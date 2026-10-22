import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { migratedDatabase, sqliteD1 } from '../../src/testing/sqliteD1'
import { BULK_CHANGED_MESSAGE } from '../domain/data/bulkEdit'
import { bulkUpdateTransactions } from './dbWrite'
import type { Env } from './env'

/**
 * `assertNoneSettledElsewhere` refuses a settle before anything is written. A payment that settles one
 * of the rows between that check and the batch is the case it cannot see, so the batch ends with a
 * check of its own and D1 undoes the whole batch when it fails.
 */

const OWNER = 'owner@example.com'
const ROWS = [1, 2, 3, 4]

let db: DatabaseSync
let between: () => void = () => undefined

/** The stand-in, with a hook that runs after the checks and just before the batch is sent. */
function envWithRaceBeforeBatch(): Env {
  const inner = sqliteD1(db)
  const wrapped = {
    prepare: inner.prepare.bind(inner),
    batch: (statements: Parameters<typeof inner.batch>[0]) => {
      between()
      return inner.batch(statements)
    },
  }
  return { DB: wrapped as unknown as D1Database } as Env
}

const settledBy = (id: number): number | null =>
  (db.prepare('SELECT settled_by FROM transactions WHERE id = ?').get(id) as { settled_by: number | null }).settled_by

beforeEach(() => {
  between = () => undefined
  db = migratedDatabase()
  db.prepare("INSERT INTO accounts (owner,id,name,kind,settlement,active) VALUES (?,1,'Main','debit','immediate',1)").run(OWNER)
  db.prepare("INSERT INTO categories (owner,id,name,monthly_budget_cents,sort_order,active) VALUES (?,1,'Food',0,0,1)").run(OWNER)
  const insert = db.prepare(
    `INSERT INTO transactions (owner,id,date,budget_month,description,account_id,category_id,type,amount_cents,cancelled)
     VALUES (?,?,'2026-09-10','2026-09',?,1,1,?,1000,0)`,
  )
  for (const id of ROWS) insert.run(OWNER, id, `Row ${id}`, 'expense')
  insert.run(OWNER, 50, 'Payment A', 'refund')
  insert.run(OWNER, 51, 'Payment B', 'refund')
})

describe('settling many rows while another payment settles one of them', () => {
  it('settles them all when nothing interferes', async () => {
    const env = envWithRaceBeforeBatch()

    const updated = await bulkUpdateTransactions(env, OWNER, ROWS, { settledBy: 50 })

    expect(updated.map((t) => t.settledBy)).toEqual([50, 50, 50, 50])
    expect(db.prepare('SELECT report_count FROM transactions WHERE id = 50').get()).toEqual({ report_count: 4 })
  })

  it('answers 409 and leaves every row, and the payment, as it was', async () => {
    between = () => db.prepare('UPDATE transactions SET settled_by = 51 WHERE id = 3').run()
    const env = envWithRaceBeforeBatch()

    await expect(bulkUpdateTransactions(env, OWNER, ROWS, { settledBy: 50 })).rejects.toMatchObject({
      status: 409,
      message: BULK_CHANGED_MESSAGE,
    })

    expect(ROWS.map(settledBy)).toEqual([null, null, 51, null])
    expect(db.prepare('SELECT report_count FROM transactions WHERE id = 50').get()).toEqual({ report_count: null })
  })

  it('counts a row that is not there or not theirs as nothing to settle, not as a conflict', async () => {
    db.prepare("INSERT INTO accounts (owner,id,name,kind,settlement,active) VALUES ('other@example.com',2,'Theirs','debit','immediate',1)").run()
    db.prepare("INSERT INTO categories (owner,id,name,monthly_budget_cents,sort_order,active) VALUES ('other@example.com',2,'Theirs',0,0,1)").run()
    db.prepare(
      `INSERT INTO transactions (owner,id,date,budget_month,description,account_id,category_id,type,amount_cents,cancelled)
       VALUES ('other@example.com',900,'2026-09-10','2026-09','Theirs',2,2,'expense',1000,0)`,
    ).run()
    const env = envWithRaceBeforeBatch()

    const updated = await bulkUpdateTransactions(env, OWNER, [...ROWS, 900, 12_345], { settledBy: 50 })

    expect(updated).toHaveLength(4)
    expect(settledBy(900)).toBeNull()
  })
})
