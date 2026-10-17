// @vitest-environment node
/**
 * `transactions.description_norm` is the JavaScript normalization of `description`, written by every
 * statement that writes a description. These tests drive each route that can set one through the real
 * middleware and a real SQLite database, and compare the whole column with the function afterwards.
 * `descriptionNormWrites.test.ts` in `_shared` reads the source for a statement nobody drove here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeDesc } from '../../../../src/domain/engine/recurringDetect'
import { shiftBudgetMonth } from '../../../../src/domain/engine/dates'
import { AWKWARD_DESCRIPTIONS } from '../../../../src/testing/awkwardDescriptions'
import { migratedDatabase, sqliteD1 } from '../../../../src/testing/sqliteD1'
import { createExpenseWorld, pinClock, type World } from '../../../_shared/testing/expenseWorld'
import { seedLedger, type SeededIds } from '../../../_shared/testing/seedLedger'
import { onRequestGet as getDataset } from '../index'
import { onRequestPost as postPlan } from '../installment-plans/index'
import { onRequestPatch as patchBulk, onRequestPost as postBulk } from './bulk'
import { onRequestPatch as patchOne } from './[id]'
import { onRequestPost as postOne } from './index'

type Sqlite = ReturnType<typeof migratedDatabase>

let sqlite: Sqlite
let world: World
let ids: SeededIds

beforeEach(async () => {
  pinClock('2026-10-17')
  sqlite = migratedDatabase()
  world = createExpenseWorld(sqlite, sqliteD1(sqlite))
  ids = await seedLedger(world)
})

afterEach(() => {
  vi.useRealTimers()
})

interface Stored {
  id: number
  description: string
  description_norm: string | null
  plan_id: number | null
}

const stored = (): Stored[] =>
  sqlite.prepare('SELECT id, description, description_norm, plan_id FROM transactions ORDER BY id').all() as unknown as Stored[]

/** Every row holds the normalization of its own description; a missing value counts as wrong. */
function expectEveryRowInSync(): void {
  const rows = stored()
  expect(rows.length).toBeGreaterThan(0)
  for (const row of rows) {
    expect(row.description_norm, `row ${row.id} ${JSON.stringify(row.description)}`).toBe(normalizeDesc(row.description))
  }
}

const expense = (description: string) => ({
  date: '2026-10-08',
  budgetMonth: '2026-10',
  description,
  accountId: ids.debit,
  categoryId: ids.groceries,
  type: 'expense',
  amountCents: 2_500,
  cancelled: false,
})

const NON_BLANK = AWKWARD_DESCRIPTIONS.filter((d) => d.trim() !== '')

describe('the routes that write a description', () => {
  it('keeps the rows the seed wrote through the routes in step', () => {
    expectEveryRowInSync()
    expect(stored().some((r) => r.description === 'Market' && r.description_norm === 'market')).toBe(true)
  })

  it('POST /transactions writes the value of the JavaScript function, not SQLite’s', async () => {
    for (const description of NON_BLANK) {
      const response = await world.call(postOne, { method: 'POST', path: '/transactions', body: expense(description) })
      expect(response.status, description).toBe(201)
    }
    expectEveryRowInSync()
    expect(stored().find((r) => r.description === 'CAFÉ')?.description_norm).toBe('café')
    expect(stored().find((r) => r.description.startsWith('\tTabbed'))?.description_norm).toBe('tabbed')
  })

  it('POST /transactions/bulk writes it for every row of an import', async () => {
    const response = await world.call(postBulk, {
      method: 'POST',
      path: '/transactions/bulk',
      body: { transactions: NON_BLANK.map(expense) },
    })
    expect(response.status).toBe(201)
    expectEveryRowInSync()
    expect(stored().filter((r) => r.description_norm === 'café').length).toBeGreaterThanOrEqual(3)
  })

  it('PATCH /transactions/:id rewrites it with the description, and leaves it when the description is not in the patch', async () => {
    const id = ids.transactions[0]!
    const patch = (body: unknown) =>
      world.call(patchOne, { method: 'PATCH', path: `/transactions/${id}`, params: { id: String(id) }, body })

    expect((await patch({ description: '  ÉCLAIR au Chocolat ' })).status).toBe(200)
    expect(stored().find((r) => r.id === id)?.description_norm).toBe('éclair au chocolat')

    expect((await patch({ amountCents: 9_900 })).status).toBe(200)
    expect(stored().find((r) => r.id === id)?.description_norm).toBe('éclair au chocolat')

    expect((await patch({ description: '   ' })).status).toBe(200)
    expect(stored().find((r) => r.id === id)?.description_norm).toBe('')
    expectEveryRowInSync()
  })

  it('PATCH /transactions/bulk rewrites it for every row it names, and only when it sets a description', async () => {
    const [first, second] = ids.transactions as [number, number]
    const bulk = (patch: unknown) =>
      world.call(patchBulk, { method: 'PATCH', path: '/transactions/bulk', body: { ids: [first, second], patch } })

    expect((await bulk({ description: 'СОВМЕСТНЫЙ Заказ' })).status).toBe(200)
    expect(stored().filter((r) => r.id === first || r.id === second).map((r) => r.description_norm)).toEqual([
      'совместный заказ',
      'совместный заказ',
    ])

    expect((await bulk({ categoryId: ids.travel })).status).toBe(200)
    expect(stored().find((r) => r.id === first)?.description_norm).toBe('совместный заказ')
    expectEveryRowInSync()
  })

  it('the installment backfill writes it for the rows it creates', async () => {
    const anchor = shiftBudgetMonth('2026-10', -2)
    const created = await world.call(postPlan, {
      method: 'POST',
      path: '/installment-plans',
      body: {
        description: 'Sofá À Crédito',
        totalCount: 4,
        amountCents: 15_000,
        accountId: ids.card,
        categoryId: ids.travel,
        type: 'expense',
        anchorBudgetMonth: anchor,
        startInstallmentIndex: 1,
        active: true,
      },
    })
    expect(created.status).toBe(201)
    const before = stored().length

    expect((await world.call(getDataset)).status).toBe(200)

    const fresh = stored().filter((r) => r.description === 'Sofá À Crédito')
    expect(stored().length).toBeGreaterThan(before)
    expect(fresh.length).toBeGreaterThanOrEqual(3)
    for (const row of fresh) expect(row.description_norm).toBe('sofá à crédito')
    expectEveryRowInSync()
  })
})

describe('the check', () => {
  it('fails for a row whose description was written without its value', () => {
    sqlite.prepare("UPDATE transactions SET description = 'Changed behind its back' WHERE id = ?").run(ids.transactions[0]!)
    expect(expectEveryRowInSync).toThrow()
  })

  it('fails for a row that was never given one', () => {
    sqlite.prepare('UPDATE transactions SET description_norm = NULL WHERE id = ?').run(ids.transactions[0]!)
    expect(expectEveryRowInSync).toThrow()
  })
})
