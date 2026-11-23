import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { migratedDatabase, sqliteD1 } from '../../src/testing/sqliteD1'
import { clearCashActual, setCashActual } from './dbCashActuals'
import type { Env } from './env'

const OWNER = 'owner@example.com'
const OTHER = 'other@example.com'

let db: DatabaseSync
let env: Env

const stored = (): { owner: string; year_month: string; actual_cash_cents: number }[] =>
  db.prepare('SELECT owner, year_month, actual_cash_cents FROM cash_actuals ORDER BY owner, year_month').all() as {
    owner: string
    year_month: string
    actual_cash_cents: number
  }[]

beforeEach(() => {
  db = migratedDatabase()
  env = { DB: sqliteD1(db) }
})

describe('setCashActual', () => {
  it('records a month and then replaces it', async () => {
    await setCashActual(env, OWNER, '2026-09', 120000)
    const saved = await setCashActual(env, OWNER, '2026-09', 95000)
    expect(saved).toMatchObject({ yearMonth: '2026-09', actualCashCents: 95000 })
    expect(stored()).toEqual([{ owner: OWNER, year_month: '2026-09', actual_cash_cents: 95000 }])
  })
})

describe('clearCashActual', () => {
  it("removes only the owner's balance for that month", async () => {
    await setCashActual(env, OWNER, '2026-09', 120000)
    await setCashActual(env, OWNER, '2026-10', 80000)
    await setCashActual(env, OTHER, '2026-09', 50000)

    await clearCashActual(env, OWNER, '2026-09')

    expect(stored()).toEqual([
      { owner: OTHER, year_month: '2026-09', actual_cash_cents: 50000 },
      { owner: OWNER, year_month: '2026-10', actual_cash_cents: 80000 },
    ])
  })
})
