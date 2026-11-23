import { describe, expect, expectTypeOf, it } from 'vitest'
import type { ExpenseAttachments, ExpenseLedgerReads, ExpenseLedgerWrites } from '../domain/ports/expenseLedger'
import type { ExpensePlanning, ExpenseWealth } from '../domain/ports/expensePlanning'
import type { ExpenseFlagsAndLabels, ExpenseReference } from '../domain/ports/expenseReference'
import type { ExpenseRepository } from '../domain/ports/expenseRepository'
import { attachments } from './inMemoryAttachments'
import repositorySource from './inMemoryExpenseRepository.ts?raw'
import { inMemoryExpenseRepository } from './inMemoryExpenseRepository'
import { flagsAndLabels } from './inMemoryFlagsAndLabels'
import { ledgerReads } from './inMemoryLedgerReads'
import { ledgerWrites } from './inMemoryLedgerWrites'
import { planning } from './inMemoryPlanning'
import { wealth } from './inMemoryWealth'
import { reference } from './inMemoryReference'
import { createState, type InMemoryState } from './inMemoryStore'

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
 * The areas `inMemoryExpenseRepository` spreads together. A key two of them return is won silently by the later
 * spread, and the type checker accepts it, so these tests are what catches it.
 */
const AREAS: Record<string, (state: InMemoryState) => object> = {
  ledgerReads,
  ledgerWrites,
  attachments,
  flagsAndLabels,
  reference,
  planning,
  wealth,
}

/** Each method name with the areas that return it. */
function areasByMethod(): Map<string, string[]> {
  const state = createState({}, 'owner@example.com')
  const byMethod = new Map<string, string[]>()
  for (const [name, area] of Object.entries(AREAS)) {
    for (const method of Object.keys(area(state))) byMethod.set(method, [...(byMethod.get(method) ?? []), name])
  }
  return byMethod
}

/** The areas the repository actually spreads, in order, read from its source. */
function spreadAreas() {
  return [...repositorySource.matchAll(/\.\.\.(\w+)\(state\)/g)].map((match) => match[1])
}

describe('inMemoryExpenseRepository areas', () => {
  it('checks every area the repository spreads, so a new one cannot skip the checks below', () => {
    expect(spreadAreas()).toEqual(Object.keys(AREAS))
  })

  it('gives no method to two areas', () => {
    const shared = [...areasByMethod()].filter(([, areas]) => areas.length > 1)
    expect(shared).toEqual([])
  })

  it('covers every method of the port between them', () => {
    expect([...areasByMethod().keys()].sort()).toEqual(Object.keys(PORT_METHODS).sort())
    expect(Object.keys(inMemoryExpenseRepository()).sort()).toEqual(Object.keys(PORT_METHODS).sort())
  })

  it('gives each area exactly the methods of one role of the port', () => {
    expectTypeOf<ReturnType<typeof ledgerReads>>().toEqualTypeOf<ExpenseLedgerReads>()
    expectTypeOf<ReturnType<typeof ledgerWrites>>().toEqualTypeOf<ExpenseLedgerWrites>()
    expectTypeOf<ReturnType<typeof attachments>>().toEqualTypeOf<ExpenseAttachments>()
    expectTypeOf<ReturnType<typeof flagsAndLabels>>().toEqualTypeOf<ExpenseFlagsAndLabels>()
    expectTypeOf<ReturnType<typeof reference>>().toEqualTypeOf<ExpenseReference>()
    expectTypeOf<ReturnType<typeof planning>>().toEqualTypeOf<ExpensePlanning>()
    expectTypeOf<ReturnType<typeof wealth>>().toEqualTypeOf<ExpenseWealth>()
  })

  it('lets a write through one area be read through another', async () => {
    const repository = inMemoryExpenseRepository()
    const category = await repository.createCategory('owner@example.com', {
      name: 'Groceries',
      monthlyBudgetCents: 0,
      sortOrder: 1,
      active: true,
    })
    const dataset = await repository.loadDataset('owner@example.com')
    expect(dataset.categories.map((c) => c.id)).toEqual([category.id])
  })
})
