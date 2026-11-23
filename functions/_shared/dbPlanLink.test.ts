import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { migratedDatabase, sqliteD1 } from '../../src/testing/sqliteD1'
import { planLinkColumns } from './dbPlanLink'
import type { Env } from './env'

const OWNER = 'owner@example.com'
const PLAN = 7

let db: DatabaseSync
let env: Env

beforeEach(() => {
  db = migratedDatabase()
  env = { DB: sqliteD1(db) }
  db.prepare(
    "INSERT INTO accounts (owner,id,name,kind,settlement,active) VALUES (?,1,'Main','debit','immediate',1)",
  ).run(OWNER)
  db.prepare(
    "INSERT INTO categories (owner,id,name,monthly_budget_cents,sort_order,active) VALUES (?,1,'Home',0,0,1)",
  ).run(OWNER)
  db.prepare(
    `INSERT INTO installment_plans (id, owner, description, total_count, amount_cents, account_id, category_id, type, anchor_budget_month, start_installment_index, active)
     VALUES (?, ?, 'Sofa', 6, 5000, 1, 1, 'expense', '2026-01', 1, 1)`,
  ).run(PLAN, OWNER)
  const insert = db.prepare(
    `INSERT INTO transactions (owner,id,date,budget_month,description,account_id,category_id,type,amount_cents,cancelled,plan_id,installment_index)
     VALUES (?,?,'2026-01-10','2026-01','Sofa',1,1,'expense',5000,0,?,?)`,
  )
  insert.run(OWNER, 10, PLAN, 1)
  insert.run(OWNER, 11, PLAN, 2)
})

describe('planLinkColumns', () => {
  it('changes nothing when the patch does not mention a plan', async () => {
    expect(await planLinkColumns(env, OWNER, 11, { notes: 'x' })).toEqual({ sets: [], values: [] })
  })

  it('unlinks on an explicit null', async () => {
    expect(await planLinkColumns(env, OWNER, 11, { planId: null })).toEqual({
      sets: ['plan_id = ?', 'installment_index = ?'],
      values: [null, null],
    })
  })

  it('gives a newly linked row the next index after the recorded ones', async () => {
    expect(await planLinkColumns(env, OWNER, 99, { planId: PLAN })).toEqual({
      sets: ['plan_id = ?', 'installment_index = ?'],
      values: [PLAN, 3],
    })
  })

  it('lets a row be saved again at its own index', async () => {
    expect(await planLinkColumns(env, OWNER, 11, { planId: PLAN, installmentIndex: 2 })).toEqual({
      sets: ['plan_id = ?', 'installment_index = ?'],
      values: [PLAN, 2],
    })
  })

  it("refuses another row's index", async () => {
    await expect(planLinkColumns(env, OWNER, 11, { planId: PLAN, installmentIndex: 1 })).rejects.toThrow(
      'Installment already recorded for this index',
    )
  })
})
