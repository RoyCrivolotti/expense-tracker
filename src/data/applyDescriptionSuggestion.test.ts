import { describe, expect, it } from 'vitest'
import type { ExpenseDataset } from '../types'
import { defaultExpenseSettings } from '../engine'
import { resolveDescriptionTemplate } from './applyDescriptionSuggestion'

const dataset: ExpenseDataset = {
  categories: [
    { id: 1, name: 'Food', monthlyBudgetCents: 0, sortOrder: 0, active: true },
    { id: 2, name: 'Old', monthlyBudgetCents: 0, sortOrder: 1, active: false },
  ],
  accounts: [
    { id: 10, name: 'Debit', kind: 'debit', settlement: 'immediate', active: true },
    { id: 20, name: 'Closed card', kind: 'credit', settlement: 'deferred', active: false },
  ],
  transactions: [],
  accountStatements: [],
  cashActuals: [],
  settings: { ...defaultExpenseSettings(), defaultAccountId: 10 },
  goalInputs: {
    housePriceCents: 0,
    downPaymentFraction: 0,
    mortgageTermYears: 0,
    mortgageRateAnnual: 0,
    longTermTargetCents: 0,
    horizonYears: 0,
    expectedRealReturn: 0,
  },
  goalScenarios: [],
  installmentPlans: [],
}

describe('resolveDescriptionTemplate', () => {
  it('keeps current ids when template targets inactive category or account', () => {
    const resolved = resolveDescriptionTemplate(
      { type: 'income', categoryId: 2, accountId: 20 },
      dataset,
      { categoryId: 1, accountId: 10 },
    )
    expect(resolved).toEqual({ type: 'income', categoryId: 1, accountId: 10 })
  })
})
