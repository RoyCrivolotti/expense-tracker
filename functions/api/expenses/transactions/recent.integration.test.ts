// @vitest-environment node
/**
 * The rows added last, through the real routes: a ledger built by saving rows with the app's own write route, dates
 * out of order, is read back by `GET /transactions/recent`. The Dashboard's "Recently added" used to sort by the
 * time each row was saved; the highest ids have to be the same rows, with back-dated ones among them.
 */
import { describe, expect, it } from 'vitest'
import { latestTransactions, recentlyAdded } from '../../../../src/domain/engine'
import type { ExpenseDataset, Transaction } from '../../../../src/domain/types'
import { seedDataset } from '../../../../src/testing/seedSqlite'
import { migratedDatabase, newStats, sqliteD1 } from '../../../../src/testing/sqliteD1'
import { syntheticLedger } from '../../../../src/testing/syntheticLedger'
import { CAT, CHECKING } from '../../../../src/testing/syntheticReference'
import { shifted } from '../../../../src/testing/transactionQueryKit'
import { OTHER, OWNER, createExpenseWorld } from '../../../_shared/testing/expenseWorld'
import { onRequestGet as getDataset } from '../index'
import { onRequestPost as createTransaction } from './index'
import { onRequestGet as getList } from './list'
import { onRequestGet as getRecent } from './recent'

async function ledger() {
  const sqlite = migratedDatabase()
  sqlite.exec('PRAGMA foreign_keys = OFF')
  const base = syntheticLedger({ months: 12, perMonth: 10, seed: 4 })
  seedDataset(sqlite, OWNER, base)
  seedDataset(sqlite, OTHER, shifted(syntheticLedger({ months: 3, perMonth: 10, seed: 6 }), 1_000_000))
  const world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  // Saved one after another, newest dates first, oldest last, so the last rows saved are the oldest by date.
  const dates = ['2026-06-20', '2026-05-02', '2025-11-30', '2026-06-21', '2024-01-15', '2026-02-10', '2025-07-04', '2026-06-19', '2023-03-03', '2026-04-04', '2026-06-22', '2022-12-24']
  for (const [i, date] of dates.entries()) {
    const body = { date, budgetMonth: date.slice(0, 7), description: `Saved ${i}`, accountId: CHECKING, categoryId: CAT.other, type: 'expense', amountCents: 100 + i, cancelled: false }
    expect((await world.call(createTransaction, { method: 'POST', body })).status).toBe(201)
  }
  return world
}

const get = async (world: Awaited<ReturnType<typeof ledger>>, search = '') =>
  world.call(getRecent, { path: `/transactions/recent${search}` })

describe('GET /transactions/recent', () => {
  it('answers the eight rows saved last, whatever their date, as the dataset carries them', async () => {
    const world = await ledger()
    const dataset = (await (await world.call(getDataset)).json()) as ExpenseDataset
    const { items } = (await (await get(world)).json()) as { items: Transaction[] }
    expect(items).toHaveLength(8)
    // Reading the dataset creates the instalments that have fallen due, which are rows saved last too.
    const backDated = items.filter((t) => t.date < '2024-01-01')
    expect(backDated.map((t) => t.description).sort()).toEqual(['Saved 11', 'Saved 8'])
    expect(items.map((t) => t.id)).toEqual(recentlyAdded(dataset.transactions).map((t) => t.id))
    for (const item of items) expect(item).toEqual(dataset.transactions.find((t) => t.id === item.id))
  })

  it('is a different list from the newest by date, which the list route gives with a limit of eight', async () => {
    const world = await ledger()
    const dataset = (await (await world.call(getDataset)).json()) as ExpenseDataset
    const page = (await (await world.call(getList, { path: '/transactions/list?limit=8' })).json()) as { items: Transaction[] }
    expect(page.items.map((t) => t.id)).toEqual(latestTransactions(dataset.transactions).map((t) => t.id))
    const { items } = (await (await get(world)).json()) as { items: Transaction[] }
    expect(items.map((t) => t.id)).not.toEqual(page.items.map((t) => t.id))
  })

  it('takes a limit of 1 to 50 and refuses anything else, and anything it does not know', async () => {
    const world = await ledger()
    expect(((await (await get(world, '?limit=3')).json()) as { items: unknown[] }).items).toHaveLength(3)
    expect(((await (await get(world, '?limit=50')).json()) as { items: unknown[] }).items).toHaveLength(50)
    for (const search of ['?limit=0', '?limit=51', '?limit=2.5', '?limit=abc', '?limit=1&limit=2', '?from=1']) {
      expect((await get(world, search)).status, search).toBe(400)
    }
  })

  it('is never cached, and reads only the signed-in owner’s rows', async () => {
    const world = await ledger()
    const response = await get(world, '?limit=50')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const { items } = (await response.json()) as { items: Transaction[] }
    const mine = new Set(((await (await world.call(getDataset)).json()) as ExpenseDataset).transactions.map((t) => t.id))
    expect(items.length).toBe(50)
    expect(items.every((t) => mine.has(t.id))).toBe(true)
  })

  it('needs the Access sign-in like every other route', async () => {
    const world = await ledger()
    const response = await world.call(getRecent, { path: '/transactions/recent', email: '' })
    expect(response.status).toBe(401)
  })
})
