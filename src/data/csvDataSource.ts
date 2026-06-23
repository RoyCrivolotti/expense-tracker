/**
 * Read-only dev data source: parses the workbook CSV bundled at build time
 * (copied into gitignored content/ by scripts/prep-expenses-data.mjs).
 */
import csvText from '../../content/expenses_v3.csv?raw'
import type { ExpenseDataset } from '../types'
import { parseWorkbookCsv } from './parseWorkbookCsv'
import type { ExpenseDataSource } from './dataSource'

export const csvDataSource: ExpenseDataSource = {
  canWrite: false,
  load(): Promise<ExpenseDataset> {
    return Promise.resolve(parseWorkbookCsv(csvText))
  },
}
