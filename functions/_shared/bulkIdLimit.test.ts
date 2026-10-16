import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { migratedDatabase, sqliteD1 } from '../../src/testing/sqliteD1'
import { AMOUNT_SIGN_MESSAGE } from '../domain/data/amountSign'
import { attachmentKeysForTransactions } from './dbAttachments'
import { backfillInstallments } from './dbInstallmentBackfill'
import { bulkUpdateTransactions, deleteTransactions } from './dbWrite'
import type { Env } from './env'

/**
 * D1 fails a statement that binds more than 100 values, and the SQLite stand-in now does the same, so
 * these run the real bulk SQL at selection sizes a one-id-per-parameter list cannot survive.
 */

const OWNER = 'owner@example.com'
const OTHER = 'other@example.com'
// Transaction ids are global, so each owner gets its own range.
const OWNER_FIRST = 1
const OTHER_FIRST = 10_000
const SIZES = [150, 500]

let db: DatabaseSync
let env: Env

interface Reference {
  account: number
  category: number
  label: number
  flag: number
  autoLabel: number
}

function seedReference(owner: string, base: number): Reference {
  const ref = { account: base, category: base, label: base, flag: base, autoLabel: base + 1 }
  db.prepare('INSERT INTO accounts (owner,id,name,kind,settlement,active) VALUES (?,?,?,?,?,1)').run(
    owner, ref.account, 'Checking', 'debit', 'immediate',
  )
  db.prepare('INSERT INTO categories (owner,id,name,monthly_budget_cents,sort_order,active) VALUES (?,?,?,0,0,1)').run(
    owner, ref.category, 'Food',
  )
  db.prepare('INSERT INTO categories (owner,id,name,monthly_budget_cents,sort_order,active) VALUES (?,?,?,0,0,1)').run(
    owner, base + 1, 'Travel',
  )
  const label = db.prepare('INSERT INTO labels (owner,id,name,color,sort_order,active) VALUES (?,?,?,?,0,1)')
  label.run(owner, ref.label, 'Trip', '#10b981')
  label.run(owner, ref.autoLabel, 'Auto', '#10b981')
  db.prepare(
    'INSERT INTO flags (owner,id,name,color,sort_order,active,reimbursable,auto_label_id) VALUES (?,?,?,?,0,1,1,?)',
  ).run(owner, ref.flag, 'Work travel', '#6366f1', ref.autoLabel)
  return ref
}

/** `count` expenses with ids `first..first+count-1`, each with a label link and a receipt with a thumbnail. */
function seedTransactions(owner: string, ref: Reference, first: number, count: number): void {
  const insert = db.prepare(
    `INSERT INTO transactions (owner,id,date,budget_month,description,account_id,category_id,type,amount_cents,cancelled)
     VALUES (?,?,?,?,?,?,?,?,?,0)`,
  )
  const link = db.prepare('INSERT INTO transaction_labels (transaction_id,label_id) VALUES (?,?)')
  const attach = db.prepare(
    `INSERT INTO transaction_attachments (owner,id,transaction_id,object_key,thumb_key,content_type,byte_size)
     VALUES (?,?,?,?,?,'image/jpeg',100)`,
  )
  for (let id = first; id < first + count; id += 1) {
    insert.run(owner, id, '2026-09-10', '2026-09', `Row ${id}`, ref.account, ref.category, 'expense', 1000)
    link.run(id, ref.label)
    attach.run(owner, id, id, `receipts/${id}`, `thumbs/${id}`)
  }
}

const range = (first: number, count: number): number[] => Array.from({ length: count }, (_, i) => first + i)

const count = (sql: string, ...args: (string | number)[]): number =>
  (db.prepare(sql).get(...args) as { n: number }).n

const transactionsOf = (owner: string): number => count('SELECT COUNT(*) AS n FROM transactions WHERE owner = ?', owner)
const linksOf = (owner: string): number =>
  count(
    'SELECT COUNT(*) AS n FROM transaction_labels WHERE transaction_id IN (SELECT id FROM transactions WHERE owner = ?)',
    owner,
  )
const receiptsOf = (owner: string): number =>
  count('SELECT COUNT(*) AS n FROM transaction_attachments WHERE owner = ?', owner)
const categoriesOf = (owner: string, categoryId: number): number =>
  count('SELECT COUNT(*) AS n FROM transactions WHERE owner = ? AND category_id = ?', owner, categoryId)

let owned: Reference
let others: Reference

beforeEach(() => {
  db = migratedDatabase()
  env = { DB: sqliteD1(db) } as Env
  owned = seedReference(OWNER, 1)
  others = seedReference(OTHER, 100)
  seedTransactions(OWNER, owned, OWNER_FIRST, 600)
  seedTransactions(OTHER, others, OTHER_FIRST, 600)
})

describe.each(SIZES)('deleting %i transactions at once', (size) => {
  it('removes the rows, their label links and their receipt rows', async () => {
    const deleted = await deleteTransactions(env, OWNER, range(OWNER_FIRST, size))

    expect(deleted).toBe(size)
    expect(transactionsOf(OWNER)).toBe(600 - size)
    expect(linksOf(OWNER)).toBe(600 - size)
    expect(receiptsOf(OWNER)).toBe(600 - size)
  })

  it('clears the settlement link of rows that pointed at a deleted refund', async () => {
    db.prepare(
      `INSERT INTO transactions (owner,id,date,budget_month,description,account_id,category_id,type,amount_cents,cancelled)
       VALUES (?,5000,'2026-09-20','2026-09','Refund',?,?,'refund',1000,0)`,
    ).run(OWNER, owned.account, owned.category)
    db.prepare('UPDATE transactions SET settled_by = 5000 WHERE owner = ? AND id IN (590, 591)').run(OWNER)

    await deleteTransactions(env, OWNER, [5000, ...range(OWNER_FIRST, size - 1)])

    expect(count('SELECT COUNT(*) AS n FROM transactions WHERE id IN (590, 591) AND settled_by IS NULL')).toBe(2)
  })

  it('leaves another owner’s rows, links and receipts alone when their ids are in the list', async () => {
    const deleted = await deleteTransactions(env, OWNER, [
      ...range(OWNER_FIRST, size),
      ...range(OTHER_FIRST, size),
    ])

    expect(deleted).toBe(size)
    expect(transactionsOf(OTHER)).toBe(600)
    expect(linksOf(OTHER)).toBe(600)
    expect(receiptsOf(OTHER)).toBe(600)
  })

  it('counts only the ids that exist and ignores repeats', async () => {
    const existing = range(OWNER_FIRST, size)
    const missing = range(50_000, size)

    const deleted = await deleteTransactions(env, OWNER, [...missing, ...existing, ...existing])

    expect(deleted).toBe(size)
    expect(transactionsOf(OWNER)).toBe(600 - size)
  })
})

describe('deleting a few transactions', () => {
  it('still works, and an empty list deletes nothing', async () => {
    expect(await deleteTransactions(env, OWNER, [1, 2, 3])).toBe(3)
    expect(await deleteTransactions(env, OWNER, [])).toBe(0)
    expect(transactionsOf(OWNER)).toBe(597)
    expect(linksOf(OWNER)).toBe(597)
  })
})

describe.each(SIZES)('editing %i transactions at once', (size) => {
  it('updates every row and returns each with its labels', async () => {
    const ids = range(OWNER_FIRST, size)

    const updated = await bulkUpdateTransactions(env, OWNER, ids, { categoryId: owned.category + 1 })

    expect(updated.map((t) => t.id).sort((a, b) => a - b)).toEqual(ids)
    expect(updated.every((t) => t.categoryId === owned.category + 1)).toBe(true)
    expect(updated.every((t) => t.labelIds.length === 1)).toBe(true)
    expect(categoriesOf(OWNER, owned.category + 1)).toBe(size)
  })

  it('leaves another owner’s rows alone and returns only the caller’s', async () => {
    const updated = await bulkUpdateTransactions(
      env,
      OWNER,
      [...range(OWNER_FIRST, size), ...range(OTHER_FIRST, size)],
      { categoryId: owned.category + 1 },
    )

    expect(updated).toHaveLength(size)
    expect(categoriesOf(OTHER, others.category + 1)).toBe(0)
    expect(categoriesOf(OTHER, others.category)).toBe(600)
  })

  it('skips ids that do not exist and returns each repeated id once', async () => {
    const existing = range(OWNER_FIRST, size)

    const updated = await bulkUpdateTransactions(env, OWNER, [...range(50_000, size), ...existing, ...existing], {
      categoryId: owned.category + 1,
    })

    expect(updated).toHaveLength(size)
  })

  it('applies the flag’s auto-label to every row', async () => {
    const ids = range(OWNER_FIRST, size)

    await bulkUpdateTransactions(env, OWNER, ids, { flagId: owned.flag })

    expect(count('SELECT COUNT(*) AS n FROM transaction_labels WHERE label_id = ?', owned.autoLabel)).toBe(size)
  })

  it('refuses a type change that would leave a withdrawal on an expense, before touching any row', async () => {
    db.prepare("UPDATE transactions SET type = 'investment', amount_cents = -500 WHERE id = ?").run(OWNER_FIRST + size - 1)

    await expect(
      bulkUpdateTransactions(env, OWNER, range(OWNER_FIRST, size), { type: 'expense', categoryId: owned.category + 1 }),
    ).rejects.toMatchObject({ status: 400, message: AMOUNT_SIGN_MESSAGE })
    expect(categoriesOf(OWNER, owned.category + 1)).toBe(0)
  })

  describe('settling them against a refund', () => {
    const refund = (id: number) =>
      db
        .prepare(
          `INSERT INTO transactions (owner,id,date,budget_month,description,account_id,category_id,type,amount_cents,cancelled)
           VALUES (?,?,'2026-09-20','2026-09','Refund',?,?,'refund',1000,0)`,
        )
        .run(OWNER, id, owned.account, owned.category)
    const settledBy = (id: number): number =>
      count('SELECT COUNT(*) AS n FROM transactions WHERE owner = ? AND settled_by = ?', OWNER, id)

    it('links every row', async () => {
      refund(5000)

      await bulkUpdateTransactions(env, OWNER, range(OWNER_FIRST, size), { settledBy: 5000 })

      expect(settledBy(5000)).toBe(size)
    })

    it('answers 409 and changes nothing when one row is already settled by another refund', async () => {
      refund(5000)
      refund(5001)
      await bulkUpdateTransactions(env, OWNER, [OWNER_FIRST + size - 1], { settledBy: 5000 })

      await expect(
        bulkUpdateTransactions(env, OWNER, range(OWNER_FIRST, size), { settledBy: 5001 }),
      ).rejects.toMatchObject({ status: 409 })
      expect(settledBy(5001)).toBe(0)
      expect(settledBy(5000)).toBe(1)
    })
  })
})

describe('editing a few transactions', () => {
  it('still works, and an empty list edits nothing', async () => {
    const updated = await bulkUpdateTransactions(env, OWNER, [1, 2, 3], { categoryId: owned.category + 1 })

    expect(updated.map((t) => t.id)).toEqual([1, 2, 3])
    expect(await bulkUpdateTransactions(env, OWNER, [], { categoryId: owned.category + 1 })).toEqual([])
  })
})

describe.each(SIZES)('looking up the receipts of %i transactions', (size) => {
  it('returns every receipt and thumbnail key', async () => {
    const keys = await attachmentKeysForTransactions(env, OWNER, range(OWNER_FIRST, size))

    expect(keys).toHaveLength(size * 2)
    expect(keys).toContain(`receipts/${OWNER_FIRST}`)
    expect(keys).toContain(`thumbs/${OWNER_FIRST + size - 1}`)
  })

  it('does not return another owner’s keys, missing ids’ keys or a repeat’s', async () => {
    const ids = range(OWNER_FIRST, size)

    const keys = await attachmentKeysForTransactions(env, OWNER, [
      ...range(OTHER_FIRST, size),
      ...range(50_000, size),
      ...ids,
      ...ids,
    ])

    expect(keys).toHaveLength(size * 2)
    expect(keys.some((k) => k.endsWith(String(OTHER_FIRST)))).toBe(false)
  })
})

describe('looking up receipts of a few transactions', () => {
  it('still works, and an empty list finds none', async () => {
    expect(await attachmentKeysForTransactions(env, OWNER, [1, 2])).toHaveLength(4)
    expect(await attachmentKeysForTransactions(env, OWNER, [])).toEqual([])
  })
})

describe('backfilling instalments for many plans', () => {
  it('reads the rows of more than 100 plans', async () => {
    db.prepare('INSERT INTO accounts (owner,id,name,kind,settlement,active) VALUES (?,?,?,?,?,1)').run(
      OWNER, 50, 'Visa', 'credit', 'deferred',
    )
    const plan = db.prepare(
      `INSERT INTO installment_plans
         (id,owner,description,total_count,amount_cents,account_id,category_id,type,anchor_budget_month,start_installment_index,active)
       VALUES (?,?,?,3,1000,50,?,'expense','2026-01',1,1)`,
    )
    for (const id of range(1, 150)) plan.run(id, OWNER, `Plan ${id}`, owned.category)

    await backfillInstallments(env, OWNER)

    expect(count('SELECT COUNT(DISTINCT plan_id) AS n FROM transactions WHERE owner = ? AND plan_id IS NOT NULL', OWNER)).toBe(150)
  })
})
