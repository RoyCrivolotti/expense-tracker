import { describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset } from '../../types'
import type { ExpenseDataSource } from '../../data/dataSource'
import { defaultExpenseSettings } from '../../engine'
import { runOnboardingSetup } from './runOnboardingSetup'

const emptyDataset: ExpenseDataset = {
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
}

describe('runOnboardingSetup', () => {
  it('persists the chosen currency, number locale, and budget rollover day', async () => {
    let dataset = emptyDataset
    const applyPatch = vi.fn((patch: (d: ExpenseDataset) => ExpenseDataset) => {
      dataset = patch(dataset)
    })
    const createCategory = vi.fn().mockResolvedValue({
      id: 1,
      name: 'Groceries',
      monthlyBudgetCents: 30000,
      sortOrder: 0,
      active: true,
    })
    const createAccount = vi
      .fn()
      .mockResolvedValueOnce({ id: 2, name: 'Debit', kind: 'debit', settlement: 'immediate', active: true })
    const updateSettings = vi.fn().mockResolvedValue({
      ...defaultExpenseSettings(),
      defaultAccountId: 2,
      currencyCode: 'USD',
      numberLocale: 'en-US',
      budgetRolloverDay: 13,
    })
    const source: ExpenseDataSource = {
      canWrite: true,
      load: vi.fn(),
      createCategory,
      createAccount,
      updateSettings,
    }

    await runOnboardingSetup(source, applyPatch, {
      categories: [{ name: 'Groceries', icon: '🛒', defaultBudgetCents: 30000 }],
      debitName: 'Debit',
      creditName: null,
      money: { currencyCode: 'USD', numberLocale: 'en-US', budgetRolloverDay: 13 },
    })

    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        currencyCode: 'USD',
        numberLocale: 'en-US',
        budgetRolloverDay: 13,
      }),
    )
    expect(dataset.settings.currencyCode).toBe('USD')
    expect(dataset.settings.numberLocale).toBe('en-US')
    expect(dataset.settings.budgetRolloverDay).toBe(13)
  })

  it('skips creating a credit account when no credit name is given', async () => {
    let dataset = emptyDataset
    const applyPatch = vi.fn((patch: (d: ExpenseDataset) => ExpenseDataset) => {
      dataset = patch(dataset)
    })
    const createAccount = vi
      .fn()
      .mockResolvedValue({ id: 2, name: 'Debit', kind: 'debit', settlement: 'immediate', active: true })
    const source: ExpenseDataSource = {
      canWrite: true,
      load: vi.fn(),
      createCategory: vi.fn(),
      createAccount,
      updateSettings: vi.fn().mockResolvedValue(defaultExpenseSettings()),
    }

    await runOnboardingSetup(source, applyPatch, {
      categories: [],
      debitName: 'Debit',
      creditName: '  ',
      money: { currencyCode: 'EUR', numberLocale: 'de-DE', budgetRolloverDay: 1 },
    })

    expect(createAccount).toHaveBeenCalledTimes(1)
    expect(dataset.accounts).toHaveLength(1)
    expect(dataset.accounts[0]?.kind).toBe('debit')
  })
})
