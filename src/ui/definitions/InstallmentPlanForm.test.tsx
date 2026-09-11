import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset, InstallmentPlan } from '../../types'
import type { ExpenseActions } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { defaultExpenseSettings } from '../../engine'
import { InstallmentPlanForm } from './InstallmentPlanForm'

function datasetWith(overrides: Partial<ExpenseDataset> = {}): ExpenseDataset {
  return {
    flags: [],
    categories: [
      { id: 1, name: 'Tech', monthlyBudgetCents: 0, sortOrder: 0, active: true },
      { id: 2, name: 'Old category', monthlyBudgetCents: 0, sortOrder: 1, active: false },
    ],
    accounts: [
      { id: 1, name: 'Main debit', kind: 'debit', settlement: 'immediate', active: true },
      { id: 2, name: 'Closed card', kind: 'credit', settlement: 'deferred', active: false },
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
    wealthAccounts: [],
    wealthCheckins: [],
    settings: defaultExpenseSettings(),
    ...overrides,
  }
}

function modelWith(dataset: ExpenseDataset): ExpenseModel {
  return {
    dataset,
    lookup: {
      category: () => undefined,
      account: () => undefined,
      categoryName: () => '',
      accountName: () => '',
      flag: () => undefined,
      installmentPlan: () => undefined,
    },
    descriptionIndex: { search: () => [], resolve: () => undefined },
    months: ['2026-07'],
  }
}

function noopActions(): ExpenseActions {
  return {
    onEdit: vi.fn(),
    onAdd: vi.fn(),
    onDuplicate: vi.fn(),
    createTransaction: vi.fn(),
    createTransactions: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    deleteTransactions: vi.fn(),
    updateTransactions: vi.fn(),
    setStatementPaid: vi.fn(),
    setCashActual: vi.fn(),
    createFlag: vi.fn(),
    updateFlag: vi.fn(),
    deleteFlag: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    updateSettings: vi.fn(),
    updateGoals: vi.fn(),
    createScenario: vi.fn(),
    updateScenario: vi.fn(),
    deleteScenario: vi.fn(),
    createInstallmentPlan: vi.fn(),
    updateInstallmentPlan: vi.fn(),
    deleteInstallmentPlan: vi.fn(),
    createWealthAccount: vi.fn(),
    updateWealthAccount: vi.fn(),
    deleteWealthAccount: vi.fn(),
    createWealthCheckin: vi.fn(),
    updateWealthCheckin: vi.fn(),
    deleteWealthCheckin: vi.fn(),
  }
}

const basePlan: InstallmentPlan = {
  id: 1,
  description: 'Iphone, Cetelam',
  totalCount: 24,
  amountCents: 5783,
  accountId: 1,
  categoryId: 1,
  type: 'expense',
  anchorBudgetMonth: '2027-01',
  startInstallmentIndex: 1,
  active: true,
}

describe('InstallmentPlanForm category/account pickers', () => {
  it('excludes inactive categories and accounts when the plan points at active ones', () => {
    render(
      <InstallmentPlanForm plan={basePlan} model={modelWith(datasetWith())} actions={noopActions()} onBack={vi.fn()} />,
    )
    const accountSelect = screen.getByLabelText('Account')
    const categorySelect = screen.getByLabelText('Category')
    expect(within(accountSelect).queryByText('Closed card')).toBeNull()
    expect(within(categorySelect).queryByText('Old category')).toBeNull()
  })

  it('still offers the plan its own inactive category and account', () => {
    const archivedPlan: InstallmentPlan = { ...basePlan, accountId: 2, categoryId: 2 }
    render(
      <InstallmentPlanForm
        plan={archivedPlan}
        model={modelWith(datasetWith())}
        actions={noopActions()}
        onBack={vi.fn()}
      />,
    )
    const accountSelect = screen.getByLabelText<HTMLSelectElement>('Account')
    const categorySelect = screen.getByLabelText<HTMLSelectElement>('Category')
    expect(within(accountSelect).getByText('Closed card (archived)')).toBeTruthy()
    expect(within(categorySelect).getByText('Old category (archived)')).toBeTruthy()
    expect(accountSelect.value).toBe('2')
    expect(categorySelect.value).toBe('2')
  })
})
