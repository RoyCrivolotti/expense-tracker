// @vitest-environment node
/**
 * The file "Export all transactions to CSV" writes when the browser holds only a window: every chunk read through
 * `apiLedgerParts` and the real routes (auth middleware, SQLite with the real migrations), over a ledger of more rows
 * than one request carries. It has to be the file a ledger held in full gives, and the count the screen shows while
 * it works has to be the number of rows in it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiLedgerParts } from '../../../src/data/apiLedgerParts'
import { exportAllTransactions } from '../../../src/data/exportAllTransactions'
import { exportTransactionsCsv } from '../../../src/data/exportCsv'
import { EXPORT_CHUNK_ROWS } from '../../../src/domain/data/exportTables'
import type { ExpenseDataset } from '../../../src/domain/types'
import { seedDataset } from '../../../src/testing/seedSqlite'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { syntheticLedger } from '../../../src/testing/syntheticLedger'
import { OWNER, createExpenseWorld, type Handler } from '../../_shared/testing/expenseWorld'
import { onRequestGet as getExport } from './export'
import { onRequestGet as getDataset } from './index'
import { onRequestGet as getReference } from './reference'

const SLOW = 120_000

afterEach(() => {
  vi.unstubAllGlobals()
})

async function serve() {
  const source = syntheticLedger({ months: 72, perMonth: 80, seed: 11 })
  expect(source.transactions.length).toBeGreaterThan(EXPORT_CHUNK_ROWS.transactions)
  const sqlite = migratedDatabase()
  sqlite.exec('PRAGMA foreign_keys = OFF')
  seedDataset(sqlite, OWNER, source)
  const world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  const dataset = (await (await world.call(getDataset)).json()) as ExpenseDataset
  const reference = (await (await world.call(getReference)).json()) as { rowCount: number }
  const exportCalls: string[] = []
  const handlers: Array<[string, Handler]> = [['/api/expenses/export', getExport]]
  const onExport = vi.fn()
  vi.stubGlobal('fetch', async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input), 'https://expenses.test')
    const handler = handlers.find(([path]) => path === url.pathname)?.[1]
    if (!handler) return new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })
    exportCalls.push(url.search)
    onExport(exportCalls.length)
    return world.call(handler, { path: `${url.pathname.slice('/api/expenses'.length)}${url.search}` })
  })
  return { sqlite, dataset, rowCount: reference.rowCount, exportCalls, onExport }
}

describe('the export of every transaction, over a ledger of more rows than one request carries', () => {
  it('writes the file a ledger held in full gives, in as many requests as it takes, and the count it shows is the rows in it', async () => {
    const { dataset, rowCount, exportCalls } = await serve()
    const rows = await exportAllTransactions(apiLedgerParts)
    expect(exportCalls.length).toBe(Math.ceil(dataset.transactions.length / EXPORT_CHUNK_ROWS.transactions))
    expect(exportCalls.length).toBeGreaterThan(1)
    expect(rows).toHaveLength(rowCount)
    expect(exportTransactionsCsv({ ...dataset, transactions: rows }, {})).toBe(exportTransactionsCsv(dataset, {}))
  }, SLOW)

  it('starts again when something is written between two requests, and the file holds the ledger as it is then', async () => {
    const { sqlite, dataset, exportCalls, onExport } = await serve()
    onExport.mockImplementation((call: number) => {
      if (call === 2) sqlite.prepare('UPDATE owner_revision SET token = ? WHERE owner = ?').run('moved', OWNER)
    })
    const rows = await exportAllTransactions(apiLedgerParts)
    expect(exportCalls).toHaveLength(4)
    expect(exportTransactionsCsv({ ...dataset, transactions: rows }, {})).toBe(exportTransactionsCsv(dataset, {}))
  }, SLOW)
})
