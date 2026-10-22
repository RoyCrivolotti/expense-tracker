/**
 * Read-only dev data source, parsed from the committed demo fixture.
 *
 * Import the fixture directly. Copying it to a writable location first would make
 * "local dev serving real data" representable again.
 */
import csvText from '../../fixtures/demo-expenses.csv?raw'
import type { ExpenseDataset } from '../types'
import { parseWorkbookCsv } from './parseWorkbookCsv'
import type { ExpenseDataSource } from './dataSource'
import { byApiOrder } from '../domain/ledger'
import { inMemoryLedgerParts } from './inMemoryLedgerParts'

/**
 * The fixture parsed, its rows in the order of the file. The demo data of `docsCaptureDataSource` is built
 * against that order (it takes "the newest row" from the front and deals notes out by position), so it asks for
 * the file order and sorts afterwards.
 */
export const parseDemoFixture = (): ExpenseDataset => parseWorkbookCsv(csvText)

/**
 * The rows in the order the API returns them (newest first, then highest id), as the server does, so that what
 * a screen shows when two rows tie does not depend on which source the rows came from.
 */
const inApiOrder = (dataset: ExpenseDataset): ExpenseDataset => ({
  ...dataset,
  transactions: [...dataset.transactions].sort(byApiOrder),
})

/** The fixture never changes, so one parse serves every part and its revision never moves. */
let parsed: ExpenseDataset | undefined
const demo = () => ({ dataset: (parsed ??= inApiOrder(parseDemoFixture())), revision: 'demo' })

export const csvDataSource: ExpenseDataSource = {
  canWrite: false,
  load(): Promise<ExpenseDataset> {
    return Promise.resolve(inApiOrder(parseDemoFixture()))
  },
  ...inMemoryLedgerParts(demo),
}
