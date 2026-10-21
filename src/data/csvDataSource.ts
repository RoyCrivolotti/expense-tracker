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
import { inMemoryLedgerParts } from './inMemoryLedgerParts'

/** The fixture never changes, so one parse serves every part and its revision never moves. */
let parsed: ExpenseDataset | undefined
const demo = () => ({ dataset: (parsed ??= parseWorkbookCsv(csvText)), revision: 'demo' })

export const csvDataSource: ExpenseDataSource = {
  canWrite: false,
  load(): Promise<ExpenseDataset> {
    return Promise.resolve(parseWorkbookCsv(csvText))
  },
  ...inMemoryLedgerParts(demo),
}
