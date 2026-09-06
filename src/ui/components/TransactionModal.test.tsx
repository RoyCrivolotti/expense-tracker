import { fireEvent, render, screen } from '@testing-library/react'
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

function renderModal(props: { editing?: Transaction | null; seed?: TransactionSeed } = {}) {
  render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
      <TransactionModal
        model={model()}
        actions={makeActions()}
        editing={props.editing ?? null}
        seed={props.seed}
        onClose={vi.fn()}
      />
    </MoneyFormatProvider>,
  )
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
})
