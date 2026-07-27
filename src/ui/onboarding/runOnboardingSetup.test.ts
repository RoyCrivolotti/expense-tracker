import { describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset } from '../../types'
import type { ExpenseDataSource } from '../../data/dataSource'
import { defaultExpenseSettings } from '../../engine'
import { buildOnboardingSettingsPatch, runOnboardingSetup } from './runOnboardingSetup'

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

describe('buildOnboardingSettingsPatch', () => {
  const currentSettings = {
    ...defaultExpenseSettings(),
    currencyCode: 'EUR',
    numberLocale: 'de-DE',
    budgetRolloverDay: 1,
    defaultAccountId: 5,
  }

  it('omits every field when nothing changed and no new debit was created', () => {
    const patch = buildOnboardingSettingsPatch(
      {
        money: { currencyCode: 'EUR', numberLocale: 'de-DE', budgetRolloverDay: 1 },
        currentSettings,
      },
      null,
    )
    expect(patch).toEqual({})
  })

  it('includes only the fields that changed', () => {
    const patch = buildOnboardingSettingsPatch(
      {
        money: { currencyCode: 'USD', numberLocale: 'de-DE', budgetRolloverDay: 1 },
        currentSettings,
      },
      null,
    )
    expect(patch).toEqual({ currencyCode: 'USD' })
  })

  it('includes all three money fields when all changed', () => {
    const patch = buildOnboardingSettingsPatch(
      {
        money: { currencyCode: 'USD', numberLocale: 'en-US', budgetRolloverDay: 13 },
        currentSettings,
      },
      null,
    )
    expect(patch).toEqual({ currencyCode: 'USD', numberLocale: 'en-US', budgetRolloverDay: 13 })
  })

  it('does not touch defaultAccountId when no new debit account was created', () => {
    const patch = buildOnboardingSettingsPatch(
      {
        money: { currencyCode: 'USD', numberLocale: 'de-DE', budgetRolloverDay: 1 },
        currentSettings,
      },
      null,
    )
    expect(patch).not.toHaveProperty('defaultAccountId')
  })

  it('sets defaultAccountId to the newly-created debit account when one was created', () => {
    const patch = buildOnboardingSettingsPatch(
      {
        money: { currencyCode: 'EUR', numberLocale: 'de-DE', budgetRolloverDay: 1 },
        currentSettings,
      },
      42,
    )
    expect(patch).toEqual({ defaultAccountId: 42 })
  })

  it('combines a changed money field with a newly-created debit account in one patch', () => {
    const patch = buildOnboardingSettingsPatch(
      {
        money: { currencyCode: 'USD', numberLocale: 'de-DE', budgetRolloverDay: 1 },
        currentSettings,
      },
      42,
    )
    expect(patch).toEqual({ currencyCode: 'USD', defaultAccountId: 42 })
  })
})

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
      addDebit: true,
      debitName: 'Debit',
      creditName: null,
      money: { currencyCode: 'USD', numberLocale: 'en-US', budgetRolloverDay: 13 },
      currentSettings: emptyDataset.settings,
      existingCategories: [],
    })

    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        currencyCode: 'USD',
        numberLocale: 'en-US',
        budgetRolloverDay: 13,
        defaultAccountId: 2,
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
      addDebit: true,
      debitName: 'Debit',
      creditName: '  ',
      money: { currencyCode: 'EUR', numberLocale: 'de-DE', budgetRolloverDay: 1 },
      currentSettings: emptyDataset.settings,
      existingCategories: [],
    })

    expect(createAccount).toHaveBeenCalledTimes(1)
    expect(dataset.accounts).toHaveLength(1)
    expect(dataset.accounts[0]?.kind).toBe('debit')
  })

  it('re-entry: skips createAccount entirely and updateSettings when nothing is opted in or changed', async () => {
    const existingSettings = {
      ...defaultExpenseSettings(),
      currencyCode: 'EUR',
      numberLocale: 'de-DE',
      budgetRolloverDay: 1,
      defaultAccountId: 7,
    }
    let dataset: ExpenseDataset = { ...emptyDataset, settings: existingSettings }
    const applyPatch = vi.fn((patch: (d: ExpenseDataset) => ExpenseDataset) => {
      dataset = patch(dataset)
    })
    const createAccount = vi.fn()
    const updateSettings = vi.fn()
    const source: ExpenseDataSource = {
      canWrite: true,
      load: vi.fn(),
      createCategory: vi.fn(),
      createAccount,
      updateSettings,
    }

    await runOnboardingSetup(source, applyPatch, {
      categories: [],
      addDebit: false,
      debitName: 'Main debit',
      creditName: null,
      money: {
        currencyCode: existingSettings.currencyCode,
        numberLocale: existingSettings.numberLocale,
        budgetRolloverDay: existingSettings.budgetRolloverDay,
      },
      currentSettings: existingSettings,
      existingCategories: [],
    })

    expect(createAccount).not.toHaveBeenCalled()
    expect(updateSettings).not.toHaveBeenCalled()
    expect(dataset.settings.defaultAccountId).toBe(7)
  })

  it('re-entry: a currency change alone does not touch defaultAccountId', async () => {
    const existingSettings = {
      ...defaultExpenseSettings(),
      currencyCode: 'EUR',
      numberLocale: 'de-DE',
      budgetRolloverDay: 1,
      defaultAccountId: 7,
    }
    let dataset: ExpenseDataset = { ...emptyDataset, settings: existingSettings }
    const applyPatch = vi.fn((patch: (d: ExpenseDataset) => ExpenseDataset) => {
      dataset = patch(dataset)
    })
    const updateSettings = vi.fn().mockResolvedValue({ ...existingSettings, currencyCode: 'USD' })
    const source: ExpenseDataSource = {
      canWrite: true,
      load: vi.fn(),
      createCategory: vi.fn(),
      createAccount: vi.fn(),
      updateSettings,
    }

    await runOnboardingSetup(source, applyPatch, {
      categories: [],
      addDebit: false,
      debitName: 'Main debit',
      creditName: null,
      money: {
        currencyCode: 'USD',
        numberLocale: existingSettings.numberLocale,
        budgetRolloverDay: existingSettings.budgetRolloverDay,
      },
      currentSettings: existingSettings,
      existingCategories: [],
    })

    expect(updateSettings).toHaveBeenCalledWith({ currencyCode: 'USD' })
    expect(dataset.settings.defaultAccountId).toBe(7)
  })

  it('re-entry: opting in to a new debit account creates it and moves defaultAccountId to it', async () => {
    const existingSettings = {
      ...defaultExpenseSettings(),
      currencyCode: 'EUR',
      numberLocale: 'de-DE',
      budgetRolloverDay: 1,
      defaultAccountId: 7,
    }
    let dataset: ExpenseDataset = { ...emptyDataset, settings: existingSettings }
    const applyPatch = vi.fn((patch: (d: ExpenseDataset) => ExpenseDataset) => {
      dataset = patch(dataset)
    })
    const createAccount = vi
      .fn()
      .mockResolvedValue({ id: 9, name: 'Second debit', kind: 'debit', settlement: 'immediate', active: true })
    const updateSettings = vi.fn().mockResolvedValue({ ...existingSettings, defaultAccountId: 9 })
    const source: ExpenseDataSource = {
      canWrite: true,
      load: vi.fn(),
      createCategory: vi.fn(),
      createAccount,
      updateSettings,
    }

    await runOnboardingSetup(source, applyPatch, {
      categories: [],
      addDebit: true,
      debitName: 'Second debit',
      creditName: null,
      money: {
        currencyCode: existingSettings.currencyCode,
        numberLocale: existingSettings.numberLocale,
        budgetRolloverDay: existingSettings.budgetRolloverDay,
      },
      currentSettings: existingSettings,
      existingCategories: [],
    })

    expect(createAccount).toHaveBeenCalledTimes(1)
    expect(updateSettings).toHaveBeenCalledWith({ defaultAccountId: 9 })
    expect(dataset.accounts).toHaveLength(1)
    expect(dataset.settings.defaultAccountId).toBe(9)
  })

  it('re-entry: seeds new categories\' sortOrder after existing ones instead of restarting at 0', async () => {
    let dataset = emptyDataset
    const applyPatch = vi.fn((patch: (d: ExpenseDataset) => ExpenseDataset) => {
      dataset = patch(dataset)
    })
    const createCategory = vi
      .fn()
      .mockResolvedValueOnce({ id: 10, name: 'Travel', monthlyBudgetCents: 0, sortOrder: 5, active: true })
      .mockResolvedValueOnce({ id: 11, name: 'Hobbies', monthlyBudgetCents: 0, sortOrder: 6, active: true })
    const source: ExpenseDataSource = {
      canWrite: true,
      load: vi.fn(),
      createCategory,
      createAccount: vi.fn(),
      updateSettings: vi.fn(),
    }

    await runOnboardingSetup(source, applyPatch, {
      categories: [
        { name: 'Travel', icon: '✈️', defaultBudgetCents: 0 },
        { name: 'Hobbies', icon: '🎨', defaultBudgetCents: 0 },
      ],
      addDebit: false,
      debitName: 'Main debit',
      creditName: null,
      money: {
        currencyCode: emptyDataset.settings.currencyCode,
        numberLocale: emptyDataset.settings.numberLocale,
        budgetRolloverDay: emptyDataset.settings.budgetRolloverDay,
      },
      currentSettings: emptyDataset.settings,
      // Existing categories already occupy sortOrder 0..4 (five of them).
      existingCategories: [0, 1, 2, 3, 4].map((sortOrder) => ({
        id: sortOrder + 1,
        name: `Existing ${sortOrder}`,
        monthlyBudgetCents: 0,
        sortOrder,
        active: true,
      })),
    })

    expect(createCategory).toHaveBeenNthCalledWith(1, expect.objectContaining({ sortOrder: 5 }))
    expect(createCategory).toHaveBeenNthCalledWith(2, expect.objectContaining({ sortOrder: 6 }))
  })
})
