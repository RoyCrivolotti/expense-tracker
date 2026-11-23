/**
 * Live D1-backed API client for /api/expenses (Cloudflare Access in production).
 * Local `vite dev` uses the read-only CSV source instead. The routes live in the area modules, assembled here.
 */
import type { ExpenseDataset } from '../types'
import type { ExpenseDataSource, LedgerPartsSource } from './dataSource'
import { req } from './apiClient'
import { attachmentRoutes, transactionRoutes } from './apiLedgerRoutes'
import { planningRoutes, wealthRoutes } from './apiPlanningRoutes'
import { flagsAndLabelsRoutes, referenceRoutes } from './apiReferenceRoutes'
import { BASE } from './apiRoutes'

/**
 * The ledger parts are imported on first use, so a browser that loads the whole dataset never fetches
 * the code that reads them.
 */
const parts = () => import('./apiLedgerParts').then((m) => m.apiLedgerParts)
const PART_READS = [
  'readReferencePart',
  'readMonthsPart',
  'readCubePart',
  'readReceiptsPart',
  'readTransactionPage',
  'readTransactionSummary',
  'readSeriesPart',
  'readUsagePart',
  'readTransactionExport',
  'readRecentTransactions',
  'readDescriptionSuggest',
] as const
const lazyParts = Object.fromEntries(
  PART_READS.map((name) => [
    name,
    (...args: unknown[]) => parts().then((p) => (p[name] as (...a: unknown[]) => unknown)(...args)),
  ]),
) as unknown as LedgerPartsSource

export const apiDataSource: ExpenseDataSource = {
  canWrite: true,
  load: () => req<ExpenseDataset>(BASE),
  ...lazyParts,
  ...transactionRoutes,
  ...attachmentRoutes,
  ...flagsAndLabelsRoutes,
  ...referenceRoutes,
  ...planningRoutes,
  ...wealthRoutes,
}
