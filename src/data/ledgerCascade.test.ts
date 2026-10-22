import { describe, expect, it } from 'vitest'
import type { ExpenseDataset, InstallmentPlan } from '../domain/types'
import {
  patchAfterAccountDelete,
  patchAfterAttachmentAdd,
  patchAfterBulkUpdate,
  patchAfterCashActual,
  patchAfterCategory,
  patchAfterCategoryDelete,
  patchAfterFlag,
  patchAfterFlagDelete,
  patchAfterInstallmentPlanCreate,
  patchAfterInstallmentPlanDelete,
  patchAfterInstallmentPlanUpdate,
  patchAfterLabelDelete,
  patchAfterScenarioCreate,
  patchAfterSettings,
  patchAfterStatementPaid,
  patchAfterTransactionCreate,
  patchAfterTransactionDelete,
  patchAfterTransactionUpdate,
} from '../ui/datasetPatches'
import { makeDataset, makeFlag, makeLabel, makeScenario, makeTransaction } from '../testing/factories'
import { cascadeOf } from './ledgerCascade'

const plan: InstallmentPlan = {
  id: 7,
  description: 'Phone',
  totalCount: 12,
  amountCents: 5_000,
  accountId: 1,
  categoryId: 1,
  type: 'expense',
  anchorBudgetMonth: '2026-01',
  startInstallmentIndex: 1,
  active: true,
}

const dataset: ExpenseDataset = makeDataset({
  categories: [
    { id: 1, name: 'Food', monthlyBudgetCents: 0, sortOrder: 0, active: true },
    { id: 2, name: 'Fun', monthlyBudgetCents: 0, sortOrder: 1, active: true },
  ],
  accounts: [
    { id: 1, name: 'Main', kind: 'debit', settlement: 'immediate', active: true },
    { id: 2, name: 'Card', kind: 'credit', settlement: 'deferred', active: true },
  ],
  flags: [makeFlag({ id: 1 }), makeFlag({ id: 2, autoLabelId: 5 })],
  labels: [makeLabel({ id: 5 })],
  installmentPlans: [plan],
  transactions: [
    makeTransaction({ id: 1, flagId: 1 }),
    makeTransaction({ id: 2, flagId: 1, settledBy: 3 }),
    makeTransaction({ id: 3, type: 'refund', reportCount: 1, reportCoveredCents: 100 }),
    makeTransaction({ id: 4 }),
  ],
})

const after = (patch: (d: ExpenseDataset) => ExpenseDataset) => cascadeOf(dataset, patch(dataset))

describe('cascadeOf, a write the server answers with more than the patch shows', () => {
  it('sees a category, an account, a flag, a label or a plan deleted', () => {
    expect(after((d) => patchAfterCategoryDelete(d, 2, { reassignedToId: 1 }))).toBe('deleted')
    expect(after((d) => patchAfterAccountDelete(d, 2, { reassignedToId: 1 }))).toBe('deleted')
    expect(after((d) => patchAfterFlagDelete(d, 1))).toBe('deleted')
    expect(after((d) => patchAfterLabelDelete(d, 5))).toBe('deleted')
    expect(after((d) => patchAfterInstallmentPlanDelete(d, 7))).toBe('deleted')
  })

  it('sees a flag given an auto-label that rows already carrying the flag will get', () => {
    expect(after((d) => patchAfterFlag(d, makeFlag({ id: 1, autoLabelId: 5 })))).toBe('autoLabel')
  })

  it('sees a row given a flag whose auto-label it lacks, but not one that has the label', () => {
    expect(after((d) => patchAfterTransactionCreate(d, makeTransaction({ id: 9, flagId: 2 })))).toBe('autoLabel')
    expect(after((d) => patchAfterTransactionUpdate(d, makeTransaction({ id: 4, flagId: 2 })))).toBe('autoLabel')
    expect(after((d) => patchAfterTransactionCreate(d, makeTransaction({ id: 9, flagId: 2, labelIds: [5] })))).toBeNull()
    expect(after((d) => patchAfterTransactionCreate(d, makeTransaction({ id: 9, flagId: 1 })))).toBeNull()
  })

  it('sees a plan added or changed, but not a plan that only closed', () => {
    expect(after((d) => patchAfterInstallmentPlanCreate(d, { ...plan, id: 8 }))).toBe('plan')
    expect(after((d) => patchAfterInstallmentPlanUpdate(d, { ...plan, totalCount: 24 }))).toBe('plan')
    expect(after((d) => patchAfterInstallmentPlanUpdate(d, { ...plan, active: false }))).toBeNull()
  })

  it('sees rows settled, and the payment that settled rows deleted', () => {
    expect(after((d) => patchAfterBulkUpdate(d, [makeTransaction({ id: 1, flagId: 1, settledBy: 3 })]))).toBe('settled')
    expect(after((d) => patchAfterTransactionDelete(d, 3))).toBe('settled')
  })

  it('reports nothing for the writes whose effect the patch shows in full', () => {
    expect(after((d) => patchAfterTransactionUpdate(d, makeTransaction({ id: 4, description: 'Renamed' })))).toBeNull()
    expect(after((d) => patchAfterTransactionDelete(d, 4))).toBeNull()
    expect(after((d) => patchAfterTransactionCreate(d, makeTransaction({ id: 9 })))).toBeNull()
    expect(after((d) => patchAfterCategory(d, { id: 1, name: 'Groceries', monthlyBudgetCents: 0, sortOrder: 0, active: true }))).toBeNull()
    expect(after((d) => patchAfterStatementPaid(d, { accountId: 2, yearMonth: '2026-01', paid: true }))).toBeNull()
    expect(after((d) => patchAfterSettings(d, { ...d.settings, openingCashCents: 5 }))).toBeNull()
    expect(after((d) => patchAfterCashActual(d, { yearMonth: '2026-01', actualCashCents: 5 }, '2026-01'))).toBeNull()
    expect(after((d) => patchAfterScenarioCreate(d, makeScenario({ id: 3 })))).toBeNull()
    expect(after((d) => patchAfterAttachmentAdd(d, { id: 1, transactionId: 4, contentType: 'image/jpeg', byteSize: 1, createdAt: 'x', hasThumb: true }))).toBeNull()
    expect(cascadeOf(dataset, structuredClone(dataset))).toBeNull()
  })
})
