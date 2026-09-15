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

export const csvDataSource: ExpenseDataSource = {
  canWrite: false,
  load(): Promise<ExpenseDataset> {
    return Promise.resolve(parseWorkbookCsv(csvText))
  },
}
