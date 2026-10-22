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
 * The rows in the order the API returns them (newest first, then highest id), as the server does, so that what
 * a screen shows when two rows tie does not depend on which source the rows came from.
 */
function parse(): ExpenseDataset {
  const dataset = parseWorkbookCsv(csvText)
  return { ...dataset, transactions: [...dataset.transactions].sort(byApiOrder) }
}

/** The fixture never changes, so one parse serves every part and its revision never moves. */
let parsed: ExpenseDataset | undefined
const demo = () => ({ dataset: (parsed ??= parse()), revision: 'demo' })

export const csvDataSource: ExpenseDataSource = {
  canWrite: false,
  load(): Promise<ExpenseDataset> {
    return Promise.resolve(parse())
  },
  ...inMemoryLedgerParts(demo),
}
