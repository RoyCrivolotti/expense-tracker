import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { ExpenseDataSource } from '../data/dataSource'
import type { ExpenseDataset } from '../types'
import { defaultExpenseSettings } from '../engine'
import { allGroupsGranted } from '../domain/accessGroups'
import { ExpensesApp } from './ExpensesApp'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

function datasetWith(overrides: Partial<ExpenseDataset> = {}): ExpenseDataset {
  return {
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
    wealthAccounts: [],
    wealthCheckins: [],
    settings: defaultExpenseSettings(),
    ...overrides,
  }
}

function sourceThatSucceeds(dataset: ExpenseDataset): ExpenseDataSource {
  return {
    canWrite: true,
    load: vi.fn().mockResolvedValue(dataset),
    createCategory: vi
      .fn()
      .mockResolvedValue({ id: 1, name: 'Groceries', monthlyBudgetCents: 30000, sortOrder: 0, active: true }),
    createAccount: vi
      .fn()
      .mockResolvedValue({ id: 2, name: 'Main debit', kind: 'debit', settlement: 'immediate', active: true }),
    updateSettings: vi.fn().mockResolvedValue(defaultExpenseSettings()),
  }
}

async function finishWizard() {
  fireEvent.click(screen.getByText('Continue')) // welcome -> money
  fireEvent.click(screen.getByText('Continue')) // money -> categories
  fireEvent.click(screen.getByText('Continue')) // categories -> accounts
  fireEvent.click(screen.getByText('Finish setup'))
  fireEvent.click(screen.getByText('Apply'))
  await waitFor(() => expect(screen.queryByText('Apply these changes?')).toBeNull())
}

describe('ExpensesApp onboarding wiring', () => {
  it('a genuine first run (empty tenant) opens the wizard automatically, and finishing it opens "add a transaction"', async () => {
    const source = sourceThatSucceeds(datasetWith())
    render(<ExpensesApp source={source} hubGrants={allGroupsGranted()} />)

    await screen.findByText('Welcome to Expenses')
    await finishWizard()

    await waitFor(() => expect(screen.getByText('New transaction')).toBeTruthy())
  })

  it('re-entry via Settings > Run setup wizard does not open "add a transaction" on finish', async () => {
    const dataset = datasetWith({
      categories: [{ id: 1, name: 'Groceries', monthlyBudgetCents: 30000, sortOrder: 0, active: true }],
      accounts: [{ id: 1, name: 'Main debit', kind: 'debit', settlement: 'immediate', active: true }],
    })
    const source = sourceThatSucceeds(dataset)
    render(<ExpensesApp source={source} hubGrants={allGroupsGranted()} />)

    // Tenant already has categories/accounts, so the wizard should not auto-open.
    await waitFor(() => expect(screen.queryByText('Welcome to Expenses')).toBeNull())

    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]!)
    fireEvent.click(await screen.findByText('Run setup wizard'))
    await screen.findByText('Welcome to Expenses')
    await finishWizard()

    expect(screen.queryByText('New transaction')).toBeNull()
  })
})

describe('ExpensesApp tab wiring', () => {
  it('opens the transactions tab with the dataset it was given', async () => {
    const dataset = datasetWith({
      categories: [{ id: 1, name: 'Groceries', monthlyBudgetCents: 30000, sortOrder: 0, active: true }],
      accounts: [{ id: 1, name: 'Main debit', kind: 'debit', settlement: 'immediate', active: true }],
      transactions: [
        {
          id: 1,
          date: '2026-07-15',
          budgetMonth: '2026-07',
          description: 'Mercadona',
          accountId: 1,
          categoryId: 1,
          type: 'expense',
          amountCents: 4200,
          cancelled: false,
        },
      ],
    })
    render(<ExpensesApp source={sourceThatSucceeds(dataset)} hubGrants={allGroupsGranted()} />)

    fireEvent.click((await screen.findAllByRole('button', { name: 'Transactions' }))[0]!)

    expect(await screen.findByText('Mercadona')).toBeTruthy()
  })
})
