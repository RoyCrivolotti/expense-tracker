import { describe, expect, it } from 'vitest'
import type { ExpenseDataset } from '../../types'
import { defaultExpenseSettings } from '../../engine'
import { accountUsageCount, categoryUsageCount } from './recordUsage'

function dataset(overrides: Partial<ExpenseDataset> = {}): ExpenseDataset {
  return {
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
    settings: defaultExpenseSettings(),
    ...overrides,
  }
}

describe('categoryUsageCount', () => {
  it('is zero for a category referenced by nothing', () => {
    expect(categoryUsageCount(dataset(), 1)).toBe(0)
  })

  it('counts transactions and installment plans referencing the category', () => {
    const ds = dataset({
      transactions: [
        {
          id: 1,
          date: '2026-01-01',
          budgetMonth: '2026-01',
          description: 'a',
          accountId: 1,
          categoryId: 5,
          type: 'expense',
          amountCents: -100,
          cancelled: false,
          status: 'posted',
        },
        {
          id: 2,
          date: '2026-01-02',
          budgetMonth: '2026-01',
          description: 'b',
          accountId: 1,
          categoryId: 9,
          type: 'expense',
          amountCents: -100,
          cancelled: false,
          status: 'posted',
        },
      ],
      installmentPlans: [
        {
          id: 1,
          description: 'plan',
          totalCount: 12,
          amountCents: 100,
          accountId: 1,
          categoryId: 5,
          type: 'expense',
          anchorBudgetMonth: '2026-01',
          startInstallmentIndex: 1,
          active: true,
        },
      ],
    })
    expect(categoryUsageCount(ds, 5)).toBe(2)
    expect(categoryUsageCount(ds, 9)).toBe(1)
  })
})

describe('accountUsageCount', () => {
  it('is zero for an account referenced by nothing', () => {
    expect(accountUsageCount(dataset(), 1)).toBe(0)
  })

  it('counts transactions, installment plans, and account statements', () => {
    const ds = dataset({
      transactions: [
        {
          id: 1,
          date: '2026-01-01',
          budgetMonth: '2026-01',
          description: 'a',
          accountId: 7,
          categoryId: 1,
          type: 'expense',
          amountCents: -100,
          cancelled: false,
          status: 'posted',
        },
      ],
      installmentPlans: [
        {
          id: 1,
          description: 'plan',
          totalCount: 12,
          amountCents: 100,
          accountId: 7,
          categoryId: 1,
          type: 'expense',
          anchorBudgetMonth: '2026-01',
          startInstallmentIndex: 1,
          active: true,
        },
      ],
      accountStatements: [{ accountId: 7, yearMonth: '2026-01', paid: false }],
    })
    expect(accountUsageCount(ds, 7)).toBe(3)
  })
})
