/**
 * Phase 1 data source: parses the workbook CSV bundled at build time (copied
 * into private/content by scripts/prep-reports.mjs). Read-only — proves the
 * compute engine and UI before any backend exists.
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
