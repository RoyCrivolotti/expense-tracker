import { describe, expect, it } from 'vitest'
import { apiDataSource } from './apiDataSource'

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
