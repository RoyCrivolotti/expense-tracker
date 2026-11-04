// @vitest-environment node
/**
 * A month of more rows than one request carries (5,000): the whole-dataset read has no such bound, so the app that
 * reads a ledger in one request opens it, and the route that reads a month as rows refuses it, which is why
 * `chooseLedger` gives that ledger to the whole-dataset app.
 */
import { describe, expect, it } from 'vitest'
import { MAX_ROWS_PER_REQUEST } from '../../../src/domain/data/ledgerParts'
import type { ExpenseDataset } from '../../../src/domain/types'
import { seedDataset } from '../../../src/testing/seedSqlite'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { syntheticLedger } from '../../../src/testing/syntheticLedger'
import { OWNER, createExpenseWorld } from '../../_shared/testing/expenseWorld'
import { onRequestGet as getDataset } from './index'
import { onRequestGet as getMonths } from './transactions/months'

async function serve() {
  const source = syntheticLedger({ months: 1, perMonth: MAX_ROWS_PER_REQUEST + 100 })
  const sqlite = migratedDatabase()
  sqlite.exec('PRAGMA foreign_keys = OFF')
  seedDataset(sqlite, OWNER, source)
  const world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  const month = source.transactions[0]!.budgetMonth
  const inMonth = source.transactions.filter((t) => t.budgetMonth === month).length
  return { world, month, inMonth }
}

describe('a month of more rows than one request carries', () => {
  it('is served whole by the dataset route, which has no row bound', async () => {
    const { world, inMonth } = await serve()
    expect(inMonth).toBeGreaterThan(MAX_ROWS_PER_REQUEST)
    const dataset = (await (await world.call(getDataset)).json()) as ExpenseDataset
    expect(dataset.transactions.length).toBeGreaterThanOrEqual(inMonth)
  })

  it('is refused by the route that reads a month as rows', async () => {
    const { world, month } = await serve()
    const response = await world.call(getMonths, { path: `/transactions/months?from=${month}&to=${month}` })
    expect(response.status).toBe(400)
  })
})
