import { describe, it, expect } from 'vitest'
import type { Transaction } from '../../types'
import type { ExpenseModel } from '../useExpenseData'
import type { TransactionSeed } from '../actions'
import { parseEuroToCents } from '../../engine/money'
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
      settings: {
        openingCashCents: 0,
        openingInvestmentCents: 0,
        liquidNetWorthCents: 0,
        defaultAccountId: null,
      },
    },
    lookup: {
      category: () => undefined,
      account: () => undefined,
      categoryName: () => 'Health',
      accountName: () => 'Debit',
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
    const fields = initialFields(null, minimalModel(), seed)
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
    const fields = initialFields(null, minimalModel(), {
      date: '2026-06-12',
      budgetMonth: '2026-06',
    })
    expect(fields.date).toBe('2026-06-12')
    expect(fields.budgetMonth).toBe('2026-06')
    expect(fields.type).toBe('expense')
    expect(fields.amount).toBe('')
    expect(fields.description).toBe('')
  })

  it.each([110, 1010, 145660])('round-trips edit amount %i cents through parseEuroToCents', (cents) => {
    const fields = initialFields(editingTxn(cents), minimalModel())
    expect(parseEuroToCents(fields.amount)).toBe(cents)
  })
})
