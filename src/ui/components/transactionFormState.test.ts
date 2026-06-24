import { describe, it, expect } from 'vitest'
import type { ExpenseModel } from '../useExpenseData'
import type { TransactionSeed } from '../actions'
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

describe('initialFields', () => {
  it('maps a recurring seed into form defaults', () => {
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
      amount: '1456.6',
      description: 'Rent',
      categoryId: 3,
      accountId: 2,
      date: '2026-07-05',
      budgetMonth: '2026-07',
      notes: '',
    })
  })
})
