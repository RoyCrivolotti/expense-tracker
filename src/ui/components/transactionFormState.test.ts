import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import type { Transaction } from '../../types'
import type { ExpenseModel } from '../useExpenseData'
import type { TransactionSeed } from '../actions'
import { EU_MONEY_FORMAT, parseMoneyToCents } from '../../engine/money'
import { defaultExpenseSettings } from '../../engine'
import { initialFields } from './transactionFormState'
import { makeTransaction } from '../../testing/factories'

function minimalModel(): ExpenseModel {
  return {
    dataset: {
      flags: [],
      attachments: [],
      categories: [{ id: 3, name: 'Health', monthlyBudgetCents: 0, sortOrder: 1, active: true }],
      accounts: [
        { id: 2, name: 'Debit', kind: 'debit', settlement: 'immediate', active: true },
      ],
      transactions: [],
      accountStatements: [],
      cashActuals: [],
      goalScenarios: [],
      installmentPlans: [],
      wealthAccounts: [],
      wealthCheckins: [],
      settings: defaultExpenseSettings(),
    },
    lookup: {
      category: () => undefined,
      account: () => undefined,
      categoryName: () => 'Health',
      accountName: () => 'Debit',
      flag: () => undefined,
      attachments: () => [],
      installmentPlan: () => undefined,
      settlementFor: () => undefined,
      settledBy: () => [],
    },
    descriptionIndex: { search: () => [], resolve: () => undefined },
    months: ['2026-07'],
  }
}

function editingTxn(amountCents: number): Transaction {
  return {
    id: 1,
    date: '2026-07-05',
    budgetMonth: '2026-07',
    description: 'Coffee',
    accountId: 2,
    categoryId: 3,
    type: 'expense',
    amountCents,
    status: 'posted',
    cancelled: false,
  }
}

describe('initialFields', () => {
  it('defaults a new transaction to the first active category, skipping a leading inactive one', () => {
    const model = minimalModel()
    model.dataset.categories = [
      { id: 1, name: 'Archived', monthlyBudgetCents: 0, sortOrder: 0, active: false },
      { id: 3, name: 'Health', monthlyBudgetCents: 0, sortOrder: 1, active: true },
    ]
    const fields = initialFields(null, model, EU_MONEY_FORMAT)
    expect(fields.categoryId).toBe(3)
  })

  it('falls back to the first category when none are active, rather than defaulting to 0', () => {
    const model = minimalModel()
    model.dataset.categories = [{ id: 1, name: 'Archived', monthlyBudgetCents: 0, sortOrder: 0, active: false }]
    const fields = initialFields(null, model, EU_MONEY_FORMAT)
    expect(fields.categoryId).toBe(1)
  })

  it('maps a recurring seed into EU-formatted amount', () => {
    const seed: TransactionSeed = {
      description: 'Rent',
      type: 'expense',
      accountId: 2,
      categoryId: 3,
      amountCents: 145660,
      date: '2026-07-05',
      budgetMonth: '2026-07',
    }
    const fields = initialFields(null, minimalModel(), EU_MONEY_FORMAT, seed)
    expect(fields).toEqual({
      type: 'expense',
      outflow: false,
      amount: '1.456,60',
      description: 'Rent',
      categoryId: 3,
      accountId: 2,
      date: '2026-07-05',
      budgetMonth: '2026-07',
      notes: '',
      flagId: null,
    })
  })

  it('merges a partial seed over defaults', () => {
    const fields = initialFields(null, minimalModel(), EU_MONEY_FORMAT, {
      date: '2026-06-12',
      budgetMonth: '2026-06',
    })
    expect(fields.date).toBe('2026-06-12')
    expect(fields.budgetMonth).toBe('2026-06')
    expect(fields.type).toBe('expense')
    expect(fields.amount).toBe('')
    expect(fields.description).toBe('')
  })

  it.each([110, 1010, 145660])('round-trips edit amount %i cents through parseMoneyToCents', (cents) => {
    const fields = initialFields(editingTxn(cents), minimalModel(), EU_MONEY_FORMAT)
    expect(parseMoneyToCents(fields.amount, EU_MONEY_FORMAT)).toBe(cents)
  })

  describe('default budget month with a non-default rollover day', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-07-20T12:00:00Z'))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('rolls into next month once the rollover day has passed (rollover=13)', () => {
      const model = minimalModel()
      model.dataset.settings.budgetRolloverDay = 13
      const fields = initialFields(null, model, EU_MONEY_FORMAT)
      expect(fields.budgetMonth).toBe('2026-08')
    })

    it('stays in the calendar month with rollover=1', () => {
      const model = minimalModel()
      model.dataset.settings.budgetRolloverDay = 1
      const fields = initialFields(null, model, EU_MONEY_FORMAT)
      expect(fields.budgetMonth).toBe('2026-07')
    })
  })
})

describe('initialFields — a seeded transaction', () => {
  it('never inherits a flag', () => {
    // Duplicate is the main caller, and a copy of a claimed expense is not
    // itself claimed.
    const fields = initialFields(null, minimalModel(), EU_MONEY_FORMAT, {
      description: 'Hotel',
      amountCents: 10_000,
    })

    expect(fields.flagId).toBeNull()
  })

  it('files an investment under the investments category, whichever way it points', () => {
    const model = minimalModel()
    model.dataset.categories = [
      ...model.dataset.categories,
      { id: 9, name: 'Investments', monthlyBudgetCents: 0, sortOrder: 2, active: true },
    ]
    const deposit = makeTransaction({ type: 'investment', amountCents: 50_000, categoryId: 3 })
    expect(initialFields(deposit, model, EU_MONEY_FORMAT).categoryId).toBe(9)
    const withdrawal = makeTransaction({ type: 'investment', amountCents: -50_000, categoryId: 3 })
    expect(initialFields(withdrawal, model, EU_MONEY_FORMAT).categoryId).toBe(9)
    // The chosen setting wins over the name.
    model.dataset.settings = { ...model.dataset.settings, investmentCategoryId: 3 }
    expect(initialFields(deposit, model, EU_MONEY_FORMAT).categoryId).toBe(3)
    // An expense keeps its own.
    expect(initialFields(makeTransaction({ type: 'expense', categoryId: 3 }), model, EU_MONEY_FORMAT).categoryId).toBe(3)
  })

  it('opens a negative investment as a withdrawal of its size', () => {
    const editing = makeTransaction({ type: 'investment', amountCents: -50_000 })
    const fields = initialFields(editing, minimalModel(), EU_MONEY_FORMAT)
    expect(fields.type).toBe('investment')
    expect(fields.outflow).toBe(true)
    expect(fields.amount).toBe('500,00')

    const copy = initialFields(null, minimalModel(), EU_MONEY_FORMAT, { type: 'investment', amountCents: -50_000 })
    expect(copy.outflow).toBe(true)
    expect(copy.amount).toBe('500,00')
  })
})
