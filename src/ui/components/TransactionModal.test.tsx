import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset, Transaction } from '../../types'
import { defaultExpenseSettings } from '../../engine'
import type { ExpenseActions, TransactionSeed } from '../actions'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import type { ExpenseModel } from '../useExpenseData'
import { TransactionModal } from './TransactionModal'

function dataset(): ExpenseDataset {
  return {
    categories: [{ id: 1, name: 'Groceries', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
    accounts: [{ id: 1, name: 'Cash', kind: 'debit', settlement: 'immediate', active: true }],
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
    descriptionIndex: { search: () => [], resolve: () => undefined },
    months: [],
  }
}

function makeActions(): ExpenseActions {
  return {
    onEdit: vi.fn(),
    onAdd: vi.fn(),
    onDuplicate: vi.fn(),
    createTransaction: vi.fn().mockResolvedValue(undefined),
    createTransactions: vi.fn().mockResolvedValue(undefined),
    updateTransaction: vi.fn().mockResolvedValue(undefined),
    deleteTransaction: vi.fn().mockResolvedValue(undefined),
    deleteTransactions: vi.fn().mockResolvedValue(undefined),
    updateTransactions: vi.fn().mockResolvedValue(undefined),
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
  }
}

function renderModal(
  props: { editing?: Transaction | null; seed?: TransactionSeed; onClose?: () => void } = {},
) {
  return render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
      <TransactionModal
        model={model()}
        actions={makeActions()}
        editing={props.editing ?? null}
        seed={props.seed}
        onClose={props.onClose ?? vi.fn()}
      />
    </MoneyFormatProvider>,
  )
}

/** The single-transaction form is the only literal `<form>` element, so this
 * reliably scopes queries to it even while both forms are mounted (one hidden). */
function singleForm(container: HTMLElement) {
  return within(container.querySelector('form')!)
}

describe('TransactionModal — batch mode toggle', () => {
  it('shows the Add one / Add multiple toggle for a from-scratch add', () => {
    renderModal()
    expect(screen.getByRole('tab', { name: 'Add one' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Add multiple' })).toBeInTheDocument()
  })

  it('switches to the batch form and back via the toggle', () => {
    renderModal()
    fireEvent.click(screen.getByRole('tab', { name: 'Add multiple' }))
    expect(screen.getByText('Add multiple transactions')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Add multiple' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(screen.getByRole('tab', { name: 'Add one' }))
    expect(screen.getByText('New transaction')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Add one' })).toHaveAttribute('aria-selected', 'true')
  })

  it('hides the toggle when editing an existing transaction', () => {
    const txn: Transaction = {
      id: 1,
      date: '2026-01-01',
      budgetMonth: '2026-01',
      description: 'Rent',
      accountId: 1,
      categoryId: 1,
      type: 'expense',
      amountCents: 1000,
      cancelled: false,
      status: 'posted',
    }
    renderModal({ editing: txn })
    expect(screen.queryByRole('tab', { name: 'Add multiple' })).not.toBeInTheDocument()
    expect(screen.getByText('Edit transaction')).toBeInTheDocument()
  })

  it('hides the toggle when a seed is present (duplicate / shortcut prefill)', () => {
    renderModal({ seed: { description: 'Copied txn', amountCents: 500 } })
    expect(screen.queryByRole('tab', { name: 'Add multiple' })).not.toBeInTheDocument()
  })

  it('keeps what was typed in the single form when switching to batch and back', () => {
    const { container } = renderModal()
    fireEvent.change(singleForm(container).getByLabelText('Description'), {
      target: { value: 'Coffee' },
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Add multiple' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Add one' }))
    expect(singleForm(container).getByLabelText('Description')).toHaveValue('Coffee')
  })

  it('keeps what was typed in the batch form when switching to single and back', () => {
    renderModal()
    fireEvent.click(screen.getByRole('tab', { name: 'Add multiple' }))
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Add one' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Add multiple' }))
    expect(screen.getByLabelText('Amount')).toHaveValue('12')
  })
})

describe('TransactionModal — closing with unsaved input', () => {
  it('closes immediately, no confirm, when nothing has been entered', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument()
  })

  it('asks to confirm before closing when the single form has unsaved input', () => {
    const onClose = vi.fn()
    const { container } = renderModal({ onClose })
    fireEvent.change(singleForm(container).getByLabelText('Description'), {
      target: { value: 'Coffee' },
    })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('cancelling the discard confirm keeps the modal open with the input intact', () => {
    const onClose = vi.fn()
    const { container } = renderModal({ onClose })
    fireEvent.change(singleForm(container).getByLabelText('Description'), {
      target: { value: 'Coffee' },
    })
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(singleForm(container).getByLabelText('Description')).toHaveValue('Coffee')
  })

  it('also asks to confirm when the batch form (not the visible one) has unsaved input', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByRole('tab', { name: 'Add multiple' }))
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '12' } })
    // Switch back to the (empty) single tab — the batch tab's draft is hidden, not gone.
    fireEvent.click(screen.getByRole('tab', { name: 'Add one' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
