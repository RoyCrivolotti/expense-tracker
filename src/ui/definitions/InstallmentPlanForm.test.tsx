import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset, InstallmentPlan } from '../../types'
import type { NewInstallmentPlan } from '../../data/dataSource'
import type { ExpenseActions } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { defaultExpenseSettings } from '../../engine'
import { InstallmentPlanForm } from './InstallmentPlanForm'
import { planErrorCopy } from './planErrorCopy'
import { validateDueDay, validatePlanInput } from '../../domain/application/installmentPlanService'

function datasetWith(overrides: Partial<ExpenseDataset> = {}): ExpenseDataset {
  return {
    flags: [],
    attachments: [],
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
      attachments: () => [],
      installmentPlan: () => undefined,
      settlementFor: () => undefined,
      settledBy: () => [],
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
    uploadAttachment: vi.fn(),
    deleteAttachment: vi.fn(),
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

describe('InstallmentPlanForm when a save is refused', () => {
  function renderRefusing(message: string) {
    const actions = noopActions()
    actions.updateInstallmentPlan = vi.fn().mockRejectedValue(new Error(message))
    render(
      <InstallmentPlanForm plan={basePlan} model={modelWith(datasetWith())} actions={actions} onBack={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /save plan/i }))
  }

  it('names the field by the label on screen, not by its payload key', async () => {
    renderRefusing('totalCount must be a positive integer')

    expect(
      await screen.findByText('Total installments must be a whole number, at least 1.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/totalCount/)).not.toBeInTheDocument()
  })

  it('passes a message it does not recognise through unchanged', async () => {
    renderRefusing('Installment plan not found')

    expect(await screen.findByText('Installment plan not found')).toBeInTheDocument()
  })

  it('offers no total below one', () => {
    render(
      <InstallmentPlanForm plan={basePlan} model={modelWith(datasetWith())} actions={noopActions()} onBack={vi.fn()} />,
    )
    expect(screen.getByLabelText<HTMLInputElement>('Total installments').min).toBe('1')
  })
})

describe('planErrorCopy against the messages the service really throws', () => {
  // The copy is looked up by the service's exact text, which reaches the form unchanged
  // through the API client. Nothing else ties the two together, so a reworded message
  // would quietly bring the payload key back on screen. Each case runs the real validator.
  const plan: NewInstallmentPlan = {
    description: 'Laptop',
    totalCount: 12,
    amountCents: 10_000,
    accountId: 1,
    categoryId: 1,
    type: 'expense',
    anchorBudgetMonth: '2026-01',
    startInstallmentIndex: 1,
    active: true,
  }

  function thrownBy(run: () => void): Error {
    try {
      run()
    } catch (e) {
      return e as Error
    }
    throw new Error('expected the validator to refuse this')
  }

  it.each([
    ['a zero total', () => validatePlanInput({ ...plan, totalCount: 0 })],
    ['a zero amount', () => validatePlanInput({ ...plan, amountCents: 0 })],
    ['a start past the total', () => validatePlanInput({ ...plan, startInstallmentIndex: 99 })],
    ['a malformed month', () => validatePlanInput({ ...plan, anchorBudgetMonth: 'January' })],
    ['a blank description', () => validatePlanInput({ ...plan, description: '  ' })],
    ['a due day past the month', () => validateDueDay(32)],
  ])('translates %s', (_, run) => {
    const error = thrownBy(run)
    const copy = planErrorCopy(error)

    expect(copy).not.toBe(error.message)
    expect(copy).not.toMatch(/totalCount|amountCents|startInstallmentIndex|anchorBudgetMonth|dueDayOfMonth/)
  })
})
