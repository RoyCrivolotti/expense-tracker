import { render, screen, within, fireEvent } from '@testing-library/react'
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

  it('calls set when the category select changes', () => {
    const set = vi.fn()
    render(
      <Fields
        form={baseForm({ categoryId: 2 })}
        set={set}
        model={modelWith()}
        editing={null}
        onAcceptSuggestion={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '1' } })
    expect(set).toHaveBeenCalledWith('categoryId', 1)
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

describe('Date/Budget month native-input overlay', () => {
  // See NativeDateOverlay in TransactionFields.tsx: the real input is kept for
  // its native picker/keyboard/accessible value but made invisible, and a
  // compact label we fully control is overlaid on top instead — because the
  // real input's own rendered text is the device locale's choice, not ours,
  // and on iOS Safari that text can be wider than a two-column row allows.

  it('shows a compact overlay label instead of the raw ISO value', () => {
    renderFields(baseForm({ date: '2026-07-05', budgetMonth: '2026-07' }), modelWith())
    expect(screen.getByText('5 Jul 2026')).toBeTruthy()
    expect(screen.getByText("Jul '26")).toBeTruthy()
  })

  it('still resolves the Date/Budget month inputs by their real value (label text-content match breaks once a visible sibling is added — see below)', () => {
    renderFields(baseForm({ date: '2026-07-05', budgetMonth: '2026-07' }), modelWith())
    // testing-library's getByLabelText matches a wrapping <label>'s full textContent,
    // which isn't aria-hidden-aware the way a real browser's accessible-name computation
    // is (confirmed separately via Playwright's getByLabel, which does exclude it) — so
    // it sees "Date10 Sep 2026" here, not "Date". Querying by the input's own value
    // sidesteps that jsdom/testing-library gap and is arguably more precise anyway.
    expect(screen.getByDisplayValue<HTMLInputElement>('2026-07-05').type).toBe('date')
    expect(screen.getByDisplayValue<HTMLInputElement>('2026-07').type).toBe('month')
  })

  it('updates date (and the derived budget month, for a new transaction) when the Date input changes', () => {
    const set = vi.fn()
    render(
      <Fields form={baseForm()} set={set} model={modelWith()} editing={null} onAcceptSuggestion={vi.fn()} />,
    )
    fireEvent.change(screen.getByDisplayValue('2026-07-05'), { target: { value: '2026-09-10' } })
    expect(set).toHaveBeenCalledWith('date', '2026-09-10')
    expect(set).toHaveBeenCalledWith('budgetMonth', '2026-09')
  })

  it('updates only budgetMonth when the Budget month input changes', () => {
    const set = vi.fn()
    render(
      <Fields form={baseForm()} set={set} model={modelWith()} editing={null} onAcceptSuggestion={vi.fn()} />,
    )
    fireEvent.change(screen.getByDisplayValue('2026-07'), { target: { value: '2026-11' } })
    expect(set).toHaveBeenCalledWith('budgetMonth', '2026-11')
    expect(set).not.toHaveBeenCalledWith('date', expect.anything())
  })
})
