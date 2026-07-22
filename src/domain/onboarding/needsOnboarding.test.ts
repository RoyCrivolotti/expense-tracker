import { describe, expect, it } from 'vitest'
import type { ExpenseDataset } from '../types'
import { needsOnboarding } from './needsOnboarding'

const empty: ExpenseDataset = {
  categories: [],
  accounts: [],
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
  settings: {
    openingCashCents: 0,
    openingInvestmentCents: 0,
    liquidNetWorthCents: 0,
    defaultAccountId: null,
  },
}

describe('needsOnboarding', () => {
  it('is true for an empty tenant', () => {
    expect(needsOnboarding(empty)).toBe(true)
  })

  it('is false once a category exists', () => {
    expect(
      needsOnboarding({
        ...empty,
        categories: [
          {
            id: 1,
            name: 'Groceries',
            monthlyBudgetCents: 100,
            sortOrder: 0,
            active: true,
          },
        ],
      }),
    ).toBe(false)
  })

  it('is false once an account exists', () => {
    expect(
      needsOnboarding({
        ...empty,
        accounts: [
          {
            id: 1,
            name: 'Main',
            kind: 'debit',
            settlement: 'immediate',
            active: true,
          },
        ],
      }),
    ).toBe(false)
  })
})
