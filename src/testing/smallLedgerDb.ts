/**
 * A small, hand-built ledger in a migrated SQLite database behind the D1 stand-in, for tests that need to
 * know exactly which rows exist: two owners, each with an account, categories, labels and a flag with an
 * auto-label, and a run of expenses with a payment (a refund) to settle them with. Import only from
 * node-environment tests.
 */
import type { DatabaseSync } from 'node:sqlite'
import type { D1Database } from '@cloudflare/workers-types'
import { migratedDatabase, sqliteD1 } from './sqliteD1'

export const OWNER = 'owner@example.com'
export const OTHER = 'other@example.com'

/** Ids of one owner's reference rows; the other owner's are the same plus `OTHER_BASE`. */
export interface SmallIds {
  account: number
  card: number
  /** Odd-numbered expenses are in `food`, even ones in `travel`. */
  food: number
  travel: number
  label: number
  autoLabel: number
  flag: number
  /** First expense id. Expenses are `first .. first + rows - 1`; the payments follow. */
  first: number
  paymentA: number
  paymentB: number
}

export const OWNER_IDS: SmallIds = idsFor(0)
export const OTHER_IDS: SmallIds = idsFor(1_000)

function idsFor(base: number): SmallIds {
  return {
    account: base + 1,
    card: base + 2,
    food: base + 1,
    travel: base + 2,
    label: base + 1,
    autoLabel: base + 2,
    flag: base + 1,
    first: base + 1,
    paymentA: base + 900,
    paymentB: base + 901,
  }
}

export interface SmallLedger {
  db: DatabaseSync
  d1: D1Database
}

function seedOwner(db: DatabaseSync, owner: string, ids: SmallIds, rows: number): void {
  db.prepare("INSERT INTO accounts (owner,id,name,kind,settlement,active) VALUES (?,?,'Checking','debit','immediate',1)").run(owner, ids.account)
  db.prepare("INSERT INTO accounts (owner,id,name,kind,settlement,active) VALUES (?,?,'Card','credit','deferred',1)").run(owner, ids.card)
  const category = db.prepare('INSERT INTO categories (owner,id,name,monthly_budget_cents,sort_order,active) VALUES (?,?,?,0,0,1)')
  category.run(owner, ids.food, 'Food')
  category.run(owner, ids.travel, 'Travel')
  const label = db.prepare("INSERT INTO labels (owner,id,name,color,sort_order,active) VALUES (?,?,?,'#10b981',0,1)")
  label.run(owner, ids.label, 'Trip')
  label.run(owner, ids.autoLabel, 'Auto')
  db.prepare(
    "INSERT INTO flags (owner,id,name,color,sort_order,active,reimbursable,auto_label_id) VALUES (?,?,'Work','#6366f1',0,1,1,?)",
  ).run(owner, ids.flag, ids.autoLabel)
  const insert = db.prepare(
    `INSERT INTO transactions (owner,id,date,budget_month,description,description_norm,account_id,category_id,type,amount_cents,cancelled)
     VALUES (?,?,?,?,?,?,?,?,?,?,0)`,
  )
  for (let i = 0; i < rows; i += 1) {
    const id = ids.first + i
    const month = i % 3 === 0 ? '2026-08' : '2026-09'
    insert.run(owner, id, `${month}-10`, month, `Row ${id}`, `row ${id}`, ids.account, i % 2 === 0 ? ids.food : ids.travel, 'expense', 1_000 + i)
  }
  insert.run(owner, ids.paymentA, '2026-09-20', '2026-09', 'Payment A', 'payment a', ids.account, ids.food, 'refund', 5_000)
  insert.run(owner, ids.paymentB, '2026-09-21', '2026-09', 'Payment B', 'payment b', ids.account, ids.food, 'refund', 5_000)
}

/** Both owners with `rows` expenses each; ids as in {@link OWNER_IDS} and {@link OTHER_IDS}. */
export function smallLedger(rows = 6): SmallLedger {
  const db = migratedDatabase()
  seedOwner(db, OWNER, OWNER_IDS, rows)
  seedOwner(db, OTHER, OTHER_IDS, rows)
  return { db, d1: sqliteD1(db) }
}

/** The ids of a table's rows for one owner, ascending. */
export function idsWhere(db: DatabaseSync, where: string, ...args: Array<string | number>): number[] {
  const rows = db.prepare(`SELECT id FROM transactions WHERE ${where} ORDER BY id`).all(...args) as Array<{ id: number }>
  return rows.map((r) => r.id)
}

/** The D1 stand-in with a hook that runs just before each batch is sent, to play a concurrent request. */
export function beforeEachBatch(inner: D1Database, hook: () => void): D1Database {
  return {
    prepare: inner.prepare.bind(inner),
    batch: (statements: Parameters<D1Database['batch']>[0]) => {
      hook()
      return inner.batch(statements)
    },
  } as unknown as D1Database
}
