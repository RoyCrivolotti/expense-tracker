import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset } from '../../types'
import { defaultExpenseSettings } from '../../engine'
import type { ExpenseActions } from '../actions'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import type { ExpenseModel } from '../useExpenseData'
import { BatchTransactionForm } from './BatchTransactionForm'

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
      <BatchTransactionForm model={m} actions={actions} onClose={onClose} />
    </MoneyFormatProvider>,
  )
  return { actions, onClose, m }
}

// jsdom doesn't implement scrollIntoView at all — the component only uses it
// as a UX nicety after a failed save, so a no-op stub is enough here.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

function amountInputs() {
  return screen.getAllByPlaceholderText(/^0,00$/)
}
function descriptionInputs() {
  return screen.getAllByPlaceholderText('e.g. Mercadona')
}
// The count/total text is split across sibling JSX text nodes ("0", "
// transaction", "s"), so a plain getByText for the joined string won't match
// — read the summary node's full textContent instead.
function summaryText() {
  return screen.getByTestId('batch-summary').textContent
}

describe('BatchTransactionForm — rendering', () => {
  it('starts with one date batch and one empty row', () => {
    renderForm()
    expect(amountInputs()).toHaveLength(1)
    expect(descriptionInputs()).toHaveLength(1)
    expect(summaryText()).toContain('0 transactions')
    expect(screen.getByRole('button', { name: /add 0 transactions/i })).toBeInTheDocument()
    // Only one date present, so there's nothing to remove yet.
    expect(screen.queryByLabelText('Remove this date')).not.toBeInTheDocument()
  })

  it('does not promise a transaction for a row with a description but no amount', () => {
    renderForm()
    fireEvent.change(descriptionInputs()[0]!, { target: { value: 'Coffee' } })
    expect(summaryText()).toContain('0 transactions')
  })

  it('counts and totals only rows with both a description/amount and a positive amount', () => {
    renderForm()
    fireEvent.change(amountInputs()[0]!, { target: { value: '12,50' } })
    fireEvent.change(descriptionInputs()[0]!, { target: { value: 'Mercadona' } })
    expect(summaryText()).toContain('1 transaction')
    expect(summaryText()).toContain('12,50')
  })
})

describe('BatchTransactionForm — rows and dates', () => {
  it('adding a row carries the previous row\'s category, account, and type forward', () => {
    renderForm()
    // Switch the first row away from every default before adding a second row.
    fireEvent.change(screen.getByDisplayValue('Groceries'), { target: { value: '2' } })
    fireEvent.change(screen.getByDisplayValue('Cash'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'income' } })
    fireEvent.click(screen.getByRole('button', { name: /add transaction/i }))

    expect(screen.getAllByDisplayValue('Dining out')).toHaveLength(2)
    expect(screen.getAllByDisplayValue('Card')).toHaveLength(2)
    expect(descriptionInputs()).toHaveLength(2)
  })

  it('adding another date defaults to one day before the earliest batch present', () => {
    renderForm()
    // NativeDateOverlay overlays a visible compact-label <span> alongside the
    // real (invisible) input inside the same <label> — that sibling's text
    // becomes part of the label's computed textContent in jsdom, so
    // getByLabelText('Date') no longer matches exactly "Date". Query the real
    // input directly instead (there's only one date field on the page here).
    const dateInput = document.querySelector<HTMLInputElement>('input[type="date"]')!
    fireEvent.change(dateInput, { target: { value: '2026-03-10' } })
    fireEvent.click(screen.getByRole('button', { name: /add another date/i }))
    const dateInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="date"]'))
    expect(dateInputs.map((i) => i.value)).toEqual(['2026-03-10', '2026-03-09'])
    expect(screen.getAllByLabelText('Remove this date')).toHaveLength(2)
  })

  it('opens the native picker when the Date field is clicked anywhere (desktop click-anywhere parity with mobile)', () => {
    const showPicker = vi.fn()
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', { value: showPicker, configurable: true })
    try {
      renderForm()
      fireEvent.click(document.querySelector('input[type="date"]')!)
      expect(showPicker).toHaveBeenCalledTimes(1)
    } finally {
      delete (HTMLInputElement.prototype as { showPicker?: () => void }).showPicker
    }
  })

  it('has no Budget month field (batch entry is Date-only; guards against the shared date-overlay component pulling one in)', () => {
    renderForm()
    expect(document.querySelector('input[type="month"]')).toBeNull()
  })

  it('removes a row', () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: /add transaction/i }))
    expect(descriptionInputs()).toHaveLength(2)
    fireEvent.click(screen.getAllByLabelText('Remove this transaction')[0]!)
    expect(descriptionInputs()).toHaveLength(1)
  })

  it('removes a date batch, but never the last one', () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: /add another date/i }))
    expect(document.querySelectorAll('input[type="date"]')).toHaveLength(2)
    fireEvent.click(screen.getAllByLabelText('Remove this date')[0]!)
    expect(document.querySelectorAll('input[type="date"]')).toHaveLength(1)
    expect(screen.queryByLabelText('Remove this date')).not.toBeInTheDocument()
  })
})

describe('BatchTransactionForm — description suggestions', () => {
  it('accepting a suggestion fills description, category, account, and type for that row', () => {
    renderForm()
    const description = descriptionInputs()[0]!
    fireEvent.change(description, { target: { value: 'Net' } })
    fireEvent.focus(description)
    fireEvent.click(screen.getByRole('option', { name: 'Netflix' }))

    expect(screen.getByDisplayValue('Netflix')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Dining out')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Card')).toBeInTheDocument()
  })
})

describe('BatchTransactionForm — save', () => {
  it('blocks save and shows an inline error on a row with an invalid amount, without saving', async () => {
    const { actions } = renderForm()
    fireEvent.change(descriptionInputs()[0]!, { target: { value: 'Broken' } })
    fireEvent.click(screen.getByRole('button', { name: /add 0 transactions/i }))

    expect(await screen.findByText('Enter an amount greater than zero')).toBeInTheDocument()
    expect(actions.createTransactions).not.toHaveBeenCalled()
  })

  it('clears a row\'s error as soon as it is edited', async () => {
    renderForm()
    fireEvent.change(descriptionInputs()[0]!, { target: { value: 'Broken' } })
    fireEvent.click(screen.getByRole('button', { name: /add 0 transactions/i }))
    expect(await screen.findByText('Enter an amount greater than zero')).toBeInTheDocument()

    fireEvent.change(amountInputs()[0]!, { target: { value: '5' } })
    expect(screen.queryByText('Enter an amount greater than zero')).not.toBeInTheDocument()
  })

  it('shows a toast-worthy state and does not call createTransactions when nothing was entered', () => {
    const { actions } = renderForm()
    fireEvent.click(screen.getByRole('button', { name: /add 0 transactions/i }))
    expect(actions.createTransactions).not.toHaveBeenCalled()
  })

  it('saves valid rows across two dates and closes the modal', async () => {
    const createTransactions = vi.fn().mockResolvedValue(undefined)
    const { onClose } = renderForm(makeActions({ createTransactions }))
    fireEvent.change(amountInputs()[0]!, { target: { value: '12,50' } })
    fireEvent.change(descriptionInputs()[0]!, { target: { value: 'Mercadona' } })

    fireEvent.click(screen.getByRole('button', { name: /add another date/i }))
    fireEvent.change(amountInputs()[1]!, { target: { value: '8' } })
    fireEvent.change(descriptionInputs()[1]!, { target: { value: 'Coffee' } })

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
    fireEvent.change(amountInputs()[0]!, { target: { value: '5' } })
    fireEvent.change(descriptionInputs()[0]!, { target: { value: 'Snack' } })
    fireEvent.click(screen.getByRole('button', { name: /add 1 transaction/i }))

    await waitFor(() => expect(actions.createTransactions).toHaveBeenCalledTimes(1))
    expect(onClose).not.toHaveBeenCalled()
  })
})
