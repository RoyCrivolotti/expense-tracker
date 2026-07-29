import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../../types'
import type { ExpenseModel } from '../useExpenseData'
import type { FormFields } from './transactionFormState'
import { defaultExpenseSettings } from '../../engine'
import { Fields } from './TransactionFields'

function modelWith(overrides: Partial<ExpenseModel['dataset']> = {}): ExpenseModel {
  return {
    dataset: {
      categories: [
        { id: 1, name: 'Groceries', monthlyBudgetCents: 0, sortOrder: 0, active: true },
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
    },
    lookup: {
      category: () => undefined,
      account: () => undefined,
      categoryName: () => '',
      accountName: () => '',
      installmentPlan: () => undefined,
    },
    descriptionIndex: { search: () => [], resolve: () => undefined },
    months: ['2026-07'],
  }
}

function baseForm(overrides: Partial<FormFields> = {}): FormFields {
  return {
    type: 'expense',
    amount: '10,00',
    description: '',
    categoryId: 1,
    accountId: 1,
    date: '2026-07-05',
    budgetMonth: '2026-07',
    notes: '',
    ...overrides,
  }
}

function renderFields(form: FormFields, model: ExpenseModel, editing: Transaction | null = null) {
  render(
    <Fields
      form={form}
      set={vi.fn()}
      model={model}
      editing={editing}
      onAcceptSuggestion={vi.fn()}
    />,
  )
}

describe('Fields category/account pickers', () => {
  it('excludes inactive categories and accounts for a new transaction pointed at active ones', () => {
    renderFields(baseForm(), modelWith())
    const categorySelect = screen.getByLabelText('Category')
    const accountSelect = screen.getByLabelText('Account')
    expect(within(categorySelect).queryByText('Old category')).toBeNull()
    expect(within(accountSelect).queryByText('Closed card')).toBeNull()
    expect(within(categorySelect).getByText('Groceries')).toBeTruthy()
    expect(within(accountSelect).getByText('Main debit')).toBeTruthy()
  })

  it('still offers the transaction being edited its own inactive category and account', () => {
    const editing: Transaction = {
      id: 5,
      date: '2026-07-05',
      budgetMonth: '2026-07',
      description: 'Old purchase',
      accountId: 2,
      categoryId: 2,
      type: 'expense',
      amountCents: 1000,
      status: 'posted',
      cancelled: false,
    }
    renderFields(baseForm({ categoryId: 2, accountId: 2 }), modelWith(), editing)
    const categorySelect = screen.getByLabelText<HTMLSelectElement>('Category')
    const accountSelect = screen.getByLabelText<HTMLSelectElement>('Account')
    expect(within(categorySelect).getByText('Old category (archived)')).toBeTruthy()
    expect(within(accountSelect).getByText('Closed card (archived)')).toBeTruthy()
    expect(categorySelect.value).toBe('2')
    expect(accountSelect.value).toBe('2')
  })

  it('keeps a fully-deleted (not just inactive) categoryId/accountId selectable via a placeholder, instead of silently dropping it', () => {
    const editing: Transaction = {
      id: 5,
      date: '2026-07-05',
      budgetMonth: '2026-07',
      description: 'Legacy purchase',
      accountId: 99,
      categoryId: 99,
      type: 'expense',
      amountCents: 1000,
      status: 'posted',
      cancelled: false,
    }
    renderFields(baseForm({ categoryId: 99, accountId: 99 }), modelWith(), editing)
    const categorySelect = screen.getByLabelText<HTMLSelectElement>('Category')
    const accountSelect = screen.getByLabelText<HTMLSelectElement>('Account')
    // Without this, the browser would silently display the first real option (e.g.
    // "Groceries") while form state still held 99 — submitting any unrelated field
    // edit would then send the stale, nonexistent id and the backend would reject it.
    expect(categorySelect.value).toBe('99')
    expect(accountSelect.value).toBe('99')
  })

  it('shows an inactive-category warning when the selected category is not active', () => {
    renderFields(baseForm({ categoryId: 2 }), modelWith())
    expect(screen.getByText('This category is inactive')).toBeTruthy()
  })

  it('does not show an inactive-category warning when the selected category is active', () => {
    renderFields(baseForm({ categoryId: 1 }), modelWith())
    expect(screen.queryByText('This category is inactive')).toBeNull()
  })

  it('does not offer an inactive category/account that is not the currently selected one, even while editing', () => {
    const editing: Transaction = {
      id: 5,
      date: '2026-07-05',
      budgetMonth: '2026-07',
      description: 'Recent purchase',
      accountId: 1,
      categoryId: 1,
      type: 'expense',
      amountCents: 1000,
      status: 'posted',
      cancelled: false,
    }
    renderFields(baseForm({ categoryId: 1, accountId: 1 }), modelWith(), editing)
    const categorySelect = screen.getByLabelText('Category')
    const accountSelect = screen.getByLabelText('Account')
    expect(within(categorySelect).queryByText('Old category')).toBeNull()
    expect(within(accountSelect).queryByText('Closed card')).toBeNull()
  })
})
