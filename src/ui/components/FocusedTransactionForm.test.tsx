import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset } from '../../types'
import { defaultExpenseSettings } from '../../engine'
import type { ExpenseActions } from '../actions'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import type { ExpenseModel } from '../useExpenseData'
import { FocusedTransactionForm } from './FocusedTransactionForm'

function dataset(): ExpenseDataset {
  return {
    categories: [
      { id: 1, name: 'Groceries', monthlyBudgetCents: 0, sortOrder: 0, active: true },
      { id: 2, name: 'Dining out', monthlyBudgetCents: 0, sortOrder: 1, active: true },
    ],
    accounts: [
      { id: 1, name: 'Cash', kind: 'debit', settlement: 'immediate', active: true },
      { id: 2, name: 'Card', kind: 'credit', settlement: 'deferred', active: true },
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
    settings: { ...defaultExpenseSettings(), defaultAccountId: 1 },
  }
}

/** A "Netflix" suggestion remembering Dining out (2) + Card (2), distinct from the (1, 1) defaults. */
function model(): ExpenseModel {
  return {
    dataset: dataset(),
    lookup: {
      category: () => undefined,
      account: () => undefined,
      categoryName: () => '',
      accountName: () => '',
      installmentPlan: () => undefined,
    },
    descriptionIndex: {
      search: (prefix: string) =>
        prefix.toLowerCase().startsWith('net')
          ? [{ label: 'Netflix', template: { type: 'expense' as const, categoryId: 2, accountId: 2 } }]
          : [],
      resolve: () => undefined,
    },
    months: [],
  }
}

function makeActions(overrides: Partial<ExpenseActions> = {}): ExpenseActions {
  return {
    onEdit: vi.fn(),
    onAdd: vi.fn(),
    onDuplicate: vi.fn(),
    createTransaction: vi.fn().mockResolvedValue(undefined),
    createTransactions: vi.fn().mockResolvedValue(undefined),
    updateTransaction: vi.fn().mockResolvedValue(undefined),
    deleteTransaction: vi.fn().mockResolvedValue(undefined),
    deleteTransactions: vi.fn().mockResolvedValue(undefined),
    setStatementPaid: vi.fn().mockResolvedValue(undefined),
    setCashActual: vi.fn().mockResolvedValue(undefined),
    createCategory: vi.fn().mockResolvedValue(undefined),
    updateCategory: vi.fn().mockResolvedValue(undefined),
    deleteCategory: vi.fn().mockResolvedValue({ reassignedToId: null }),
    createAccount: vi.fn().mockResolvedValue(undefined),
    updateAccount: vi.fn().mockResolvedValue(undefined),
    deleteAccount: vi.fn().mockResolvedValue({ reassignedToId: null }),
    updateSettings: vi.fn().mockResolvedValue(undefined),
    updateGoals: vi.fn().mockResolvedValue(undefined),
    createScenario: vi.fn(),
    updateScenario: vi.fn().mockResolvedValue(undefined),
    deleteScenario: vi.fn().mockResolvedValue(undefined),
    createInstallmentPlan: vi.fn(),
    updateInstallmentPlan: vi.fn().mockResolvedValue(undefined),
    deleteInstallmentPlan: vi.fn().mockResolvedValue(undefined),
    createWealthAccount: vi.fn(),
    updateWealthAccount: vi.fn(),
    deleteWealthAccount: vi.fn(),
    createWealthCheckin: vi.fn(),
    updateWealthCheckin: vi.fn(),
    deleteWealthCheckin: vi.fn(),
    ...overrides,
  }
}

function renderForm(actions = makeActions(), onClose = vi.fn()) {
  const m = model()
  render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
      <FocusedTransactionForm model={m} actions={actions} onClose={onClose} />
    </MoneyFormatProvider>,
  )
  return { actions, onClose, m }
}

function amountInput() {
  return screen.getByLabelText('Amount (€)')
}
function descriptionInput() {
  return screen.getByPlaceholderText('e.g. Mercadona')
}
function nextButton() {
  return screen.getByRole('button', { name: /next transaction/i })
}
// The count/total text is split across sibling JSX text nodes, so a plain
// getByText for the joined string won't match — read the full textContent.
function summaryText() {
  return screen.getByTestId('focused-summary').textContent
}

describe('FocusedTransactionForm — rendering', () => {
  it('starts with one draft, no chips, and a disabled Next button', () => {
    renderForm()
    expect(amountInput()).toHaveValue('')
    expect(summaryText()).toContain('0 transactions')
    expect(screen.getByRole('button', { name: /add 0 transactions/i })).toBeInTheDocument()
    expect(nextButton()).toBeDisabled()
    expect(screen.queryByLabelText('Remove this transaction')).not.toBeInTheDocument()
  })

  it('does not promise a transaction for a draft with a description but no amount', () => {
    renderForm()
    fireEvent.change(descriptionInput(), { target: { value: 'Coffee' } })
    expect(summaryText()).toContain('0 transactions')
    expect(nextButton()).not.toBeDisabled()
  })

  it('counts and totals only a draft with both a description/amount and a positive amount', () => {
    renderForm()
    fireEvent.change(amountInput(), { target: { value: '12,50' } })
    fireEvent.change(descriptionInput(), { target: { value: 'Mercadona' } })
    expect(summaryText()).toContain('1 transaction')
    expect(summaryText()).toContain('12,50')
  })
})

describe('FocusedTransactionForm — advancing and chips', () => {
  it('advancing carries category/account/type forward but resets amount and description', () => {
    renderForm()
    fireEvent.change(screen.getByDisplayValue('Groceries'), { target: { value: '2' } })
    fireEvent.change(screen.getByDisplayValue('Cash'), { target: { value: '2' } })
    fireEvent.change(amountInput(), { target: { value: '12,50' } })
    fireEvent.change(descriptionInput(), { target: { value: 'Mercadona' } })

    fireEvent.click(nextButton())

    expect(screen.getByDisplayValue('Dining out')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Card')).toBeInTheDocument()
    expect(amountInput()).toHaveValue('')
    expect(descriptionInput()).toHaveValue('')
    // The completed first draft is now a chip.
    expect(screen.getByRole('button', { name: /Mercadona.*12,50/ })).toBeInTheDocument()
  })

  it('labels a chip "Untitled" when its draft has no description', () => {
    renderForm()
    fireEvent.change(amountInput(), { target: { value: '5' } })
    fireEvent.click(nextButton())
    expect(screen.getByRole('button', { name: /Untitled.*5,00/ })).toBeInTheDocument()
  })

  it('tapping a chip re-focuses that draft and collapses the current one instead', () => {
    renderForm()
    fireEvent.change(amountInput(), { target: { value: '12,50' } })
    fireEvent.change(descriptionInput(), { target: { value: 'Mercadona' } })
    fireEvent.click(nextButton())
    fireEvent.change(amountInput(), { target: { value: '8' } })
    fireEvent.change(descriptionInput(), { target: { value: 'Coffee' } })

    fireEvent.click(screen.getByRole('button', { name: /Mercadona/ }))

    expect(amountInput()).toHaveValue('12,50')
    expect(descriptionInput()).toHaveValue('Mercadona')
    expect(screen.getByRole('button', { name: /Coffee.*8,00/ })).toBeInTheDocument()
  })

  it('removes a draft via its chip', () => {
    renderForm()
    fireEvent.change(amountInput(), { target: { value: '12,50' } })
    fireEvent.change(descriptionInput(), { target: { value: 'Mercadona' } })
    fireEvent.click(nextButton())
    expect(screen.getByRole('button', { name: /Mercadona/ })).toBeInTheDocument()

    fireEvent.click(screen.getAllByLabelText('Remove this transaction')[0]!)

    expect(screen.queryByText(/Mercadona/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Remove this transaction')).not.toBeInTheDocument()
  })

  it('never removes the last remaining draft', () => {
    renderForm()
    expect(screen.queryByLabelText('Remove this transaction')).not.toBeInTheDocument()
  })
})

describe('FocusedTransactionForm — description suggestions', () => {
  it('accepting a suggestion fills description, category, account, and type for the active draft', () => {
    renderForm()
    const description = descriptionInput()
    fireEvent.change(description, { target: { value: 'Net' } })
    fireEvent.focus(description)
    fireEvent.click(screen.getByRole('option', { name: 'Netflix' }))

    expect(screen.getByDisplayValue('Netflix')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Dining out')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Card')).toBeInTheDocument()
  })
})

describe('FocusedTransactionForm — save', () => {
  it('blocks save and shows an inline error on an invalid amount, without saving', async () => {
    const { actions } = renderForm()
    fireEvent.change(descriptionInput(), { target: { value: 'Broken' } })
    fireEvent.change(amountInput(), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /add 0 transactions/i }))

    expect(await screen.findByText('Enter an amount greater than zero')).toBeInTheDocument()
    expect(actions.createTransactions).not.toHaveBeenCalled()
  })

  it('shows a toast-worthy state and does not call createTransactions when nothing was entered', () => {
    const { actions } = renderForm()
    fireEvent.click(screen.getByRole('button', { name: /add 0 transactions/i }))
    expect(actions.createTransactions).not.toHaveBeenCalled()
  })

  it('saves valid drafts across two transactions and closes the modal', async () => {
    const createTransactions = vi.fn().mockResolvedValue(undefined)
    const { onClose } = renderForm(makeActions({ createTransactions }))
    fireEvent.change(amountInput(), { target: { value: '12,50' } })
    fireEvent.change(descriptionInput(), { target: { value: 'Mercadona' } })
    fireEvent.click(nextButton())
    fireEvent.change(amountInput(), { target: { value: '8' } })
    fireEvent.change(descriptionInput(), { target: { value: 'Coffee' } })

    fireEvent.click(screen.getByRole('button', { name: /add 2 transactions/i }))

    await waitFor(() => expect(createTransactions).toHaveBeenCalledTimes(1))
    const saved = createTransactions.mock.calls[0]![0] as unknown[]
    expect(saved).toHaveLength(2)
    expect(saved[0]).toMatchObject({ description: 'Mercadona', amountCents: 1250, accountId: 1, categoryId: 1 })
    expect(saved[1]).toMatchObject({ description: 'Coffee', amountCents: 800, accountId: 1, categoryId: 1 })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('surfaces a rejected save as a toast and does not close the modal', async () => {
    const actions = makeActions({ createTransactions: vi.fn().mockRejectedValue(new Error('network down')) })
    const { onClose } = renderForm(actions)
    fireEvent.change(amountInput(), { target: { value: '5' } })
    fireEvent.change(descriptionInput(), { target: { value: 'Snack' } })
    fireEvent.click(screen.getByRole('button', { name: /add 1 transaction/i }))

    await waitFor(() => expect(actions.createTransactions).toHaveBeenCalledTimes(1))
    expect(onClose).not.toHaveBeenCalled()
  })
})
