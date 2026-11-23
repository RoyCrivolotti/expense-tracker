import { describe, expect, expectTypeOf, it } from 'vitest'
import { apiDataSource } from './apiDataSource'
import type { ExpenseDataSource, LedgerPartsSource } from './dataSource'
import { attachmentRoutes, transactionRoutes } from './apiLedgerRoutes'
import { planningRoutes, wealthRoutes } from './apiPlanningRoutes'
import { flagsAndLabelsRoutes, referenceRoutes } from './apiReferenceRoutes'

/**
 * Every key the live data source has. Screens feature-detect the optional ones, so a key that goes missing, or
 * appears where it was not, changes what the app offers. A key two spread parts both define is won by the later one
 * and the type checker accepts it, so the list is compared with the object itself.
 */
const KEYS = [
  'canWrite',
  'load',
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
  'createTransaction',
  'createTransactions',
  'updateTransaction',
  'deleteTransaction',
  'deleteTransactions',
  'updateTransactions',
  'setStatementPaid',
  'setCashActual',
  'uploadAttachment',
  'deleteAttachment',
  'createFlag',
  'updateFlag',
  'deleteFlag',
  'createLabel',
  'updateLabel',
  'deleteLabel',
  'setTransactionLabels',
  'createCategory',
  'updateCategory',
  'deleteCategory',
  'createAccount',
  'updateAccount',
  'deleteAccount',
  'updateSettings',
  'createScenario',
  'updateScenario',
  'activateScenario',
  'deleteScenario',
  'createInstallmentPlan',
  'updateInstallmentPlan',
  'deleteInstallmentPlan',
  'createWealthAccount',
  'updateWealthAccount',
  'deleteWealthAccount',
  'createWealthCheckin',
  'updateWealthCheckin',
  'deleteWealthCheckin',
]

describe('apiDataSource keys', () => {
  it('has exactly the methods the screens know it by, and leaves the optional ones it never had absent', () => {
    expect(Object.keys(apiDataSource).sort()).toEqual([...KEYS].sort())
    expect(apiDataSource).not.toHaveProperty('addLabelsToTransactions')
    expect(apiDataSource).not.toHaveProperty('updateMatchingTransactions')
  })
})

/** The area objects `apiDataSource` spreads after its own keys and the lazy ledger parts. */
const AREAS: Record<string, object> = {
  transactionRoutes,
  attachmentRoutes,
  flagsAndLabelsRoutes,
  referenceRoutes,
  planningRoutes,
  wealthRoutes,
}

describe('apiDataSource areas', () => {
  it('gives no method to two areas', () => {
    const owners = new Map<string, string[]>()
    for (const [name, area] of Object.entries(AREAS)) {
      for (const key of Object.keys(area)) owners.set(key, [...(owners.get(key) ?? []), name])
    }
    expect([...owners].filter(([, areas]) => areas.length > 1)).toEqual([])
  })

  it('has every method the source has beyond its own load and the lazy ledger parts', () => {
    const areaKeys = Object.values(AREAS).flatMap((area) => Object.keys(area))
    const own = ['canWrite', 'load', ...KEYS.filter((key) => key.startsWith('read'))]
    expect([...areaKeys, ...own].sort()).toEqual([...KEYS].sort())
  })

  it('serves each method from the area that defines it', () => {
    for (const area of Object.values(AREAS)) {
      for (const [key, method] of Object.entries(area)) {
        expect(apiDataSource[key as keyof typeof apiDataSource]).toBe(method)
      }
    }
  })

  it('gives the areas, between them, every optional method of the port that the live source offers', () => {
    type AreaKeys =
      | keyof typeof transactionRoutes
      | keyof typeof attachmentRoutes
      | keyof typeof flagsAndLabelsRoutes
      | keyof typeof referenceRoutes
      | keyof typeof planningRoutes
      | keyof typeof wealthRoutes
    /** The two writes only a ledger read in pages carries, which `withLedgerWrites` adds. */
    type AddedByLedgerWrites = 'addLabelsToTransactions' | 'updateMatchingTransactions'
    type Offered = Exclude<keyof ExpenseDataSource, 'canWrite' | 'load' | keyof LedgerPartsSource | AddedByLedgerWrites>
    expectTypeOf<AreaKeys>().toEqualTypeOf<Offered>()
  })
})
