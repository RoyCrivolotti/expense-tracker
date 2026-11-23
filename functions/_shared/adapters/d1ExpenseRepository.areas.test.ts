import { describe, expect, it } from 'vitest'
import type { ExpenseRepository } from '../../domain/ports/expenseRepository'
import type { Env } from '../env'
import { attachments, ledgerReads, ledgerWrites } from './d1ExpenseLedger'
import { flagsAndLabels, reference } from './d1ExpenseReference'
import { planning, wealth } from './d1ExpensePlanning'
import repositorySource from './d1ExpenseRepository.ts?raw'

/**
 * Every method of the port, once. `satisfies` makes the type checker reject a name the port lacks and a method
 * missing here, so this list cannot drift from the port.
 */
const PORT_METHODS = {
  loadDataset: true,
  listOwners: true,
  queryTransactions: true,
  summarizeTransactions: true,
  getTransaction: true,
  recentTransactions: true,
  readLedgerReference: true,
  readMonthRows: true,
  readMonthCells: true,
  readSeries: true,
  suggestDescriptions: true,
  readUsage: true,
  readExportChunk: true,
  insertTransaction: true,
  updateTransaction: true,
  deleteTransaction: true,
  deleteTransactions: true,
  bulkUpdateTransactions: true,
  bulkUpdateTransactionsByFilter: true,
  addLabelsToTransactions: true,
  setStatementPaid: true,
  setCashActual: true,
  clearCashActual: true,
  bulkInsertTransactions: true,
  transactionExists: true,
  listAttachments: true,
  findAttachmentSource: true,
  createAttachment: true,
  deleteAttachment: true,
  attachmentBytesUsed: true,
  attachmentKeysForTransactions: true,
  createFlag: true,
  updateFlag: true,
  deleteFlag: true,
  createLabel: true,
  updateLabel: true,
  deleteLabel: true,
  setTransactionLabels: true,
  createCategory: true,
  updateCategory: true,
  deleteCategory: true,
  createAccount: true,
  updateAccount: true,
  deleteAccount: true,
  updateSettings: true,
  createScenario: true,
  updateScenario: true,
  activateScenario: true,
  deleteScenario: true,
  createInstallmentPlan: true,
  updateInstallmentPlan: true,
  deleteInstallmentPlan: true,
  createWealthAccount: true,
  updateWealthAccount: true,
  deleteWealthAccount: true,
  createWealthCheckin: true,
  updateWealthCheckin: true,
  deleteWealthCheckin: true,
} satisfies Record<keyof ExpenseRepository, true>

/**
 * The factories `createD1ExpenseRepository` spreads together. A key two of them return is won silently by the later
 * spread, and the type checker accepts it, so these tests are what catches it.
 */
const AREAS: Record<string, (env: Env) => object> = {
  ledgerReads,
  ledgerWrites,
  attachments,
  flagsAndLabels,
  reference,
  planning,
  wealth,
}

/** Each method name with the areas that return it. Building an area only captures `env`, so an empty one does. */
function areasByMethod(): Map<string, string[]> {
  const byMethod = new Map<string, string[]>()
  for (const [name, area] of Object.entries(AREAS)) {
    for (const method of Object.keys(area({} as Env))) byMethod.set(method, [...(byMethod.get(method) ?? []), name])
  }
  return byMethod
}

/** The factories the repository actually spreads, in order, read from its source. */
function spreadAreas() {
  return [...repositorySource.matchAll(/\.\.\.(\w+)\(/g)].map((match) => match[1])
}

describe('createD1ExpenseRepository areas', () => {
  it('checks every factory the repository spreads, so a new one cannot skip the checks below', () => {
    expect(spreadAreas()).toEqual(Object.keys(AREAS))
  })

  it('gives no method to two areas', () => {
    const shared = [...areasByMethod()].filter(([, areas]) => areas.length > 1)
    expect(shared).toEqual([])
  })

  it('covers every method of the port between them', () => {
    expect([...areasByMethod().keys()].sort()).toEqual(Object.keys(PORT_METHODS).sort())
  })
})
