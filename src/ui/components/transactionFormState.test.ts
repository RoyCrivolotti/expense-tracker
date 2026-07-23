import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import type { Transaction } from '../../types'
import type { ExpenseModel } from '../useExpenseData'
import type { TransactionSeed } from '../actions'
import { EU_MONEY_FORMAT, parseMoneyToCents } from '../../engine/money'
import { defaultExpenseSettings } from '../../engine'
import { initialFields } from './transactionFormState'

function minimalModel(): ExpenseModel {
  return {
    dataset: {
      categories: [{ id: 3, name: 'Health', monthlyBudgetCents: 0, sortOrder: 1, active: true }],
      accounts: [
        { id: 2, name: 'Debit', kind: 'debit', settlement: 'immediate', active: true },
      ],
      transactions: [],
      accountStatements: [],
      cashActuals: [],
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
      settings: defaultExpenseSettings(),
    },
    lookup: {
      category: () => undefined,
      account: () => undefined,
      categoryName: () => 'Health',
      accountName: () => 'Debit',
      installmentPlan: () => undefined,
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
      amount: '1.456,60',
      description: 'Rent',
      categoryId: 3,
      accountId: 2,
      date: '2026-07-05',
      budgetMonth: '2026-07',
      notes: '',
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
