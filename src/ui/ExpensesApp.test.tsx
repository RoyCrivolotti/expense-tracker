import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { ExpenseDataSource } from '../data/dataSource'
import type { ExpenseDataset } from '../types'
import { defaultExpenseSettings } from '../engine'
import { allGroupsGranted } from '../domain/accessGroups'
import { makeScenario, makeWealthAccount } from '../testing/factories'
import { ExpensesApp } from './ExpensesApp'
import { setMotionDisabledForTests } from './hooks/motion'
import { ToastProvider } from './hooks/ToastProvider'

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
    flags: [],
    attachments: [],
    categories: [],
    accounts: [],
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
    fireEvent.click(await screen.findByRole('radio', { name: 'Setup' }))
    fireEvent.click(await screen.findByText('Run setup wizard'))
    await screen.findByText('Welcome to Expenses')
    await finishWizard()

    expect(screen.queryByText('New transaction')).toBeNull()
  })

  it('Settings > Account tab shows the signed-in email', async () => {
    const source = sourceThatSucceeds(datasetWith())
    render(<ExpensesApp source={source} hubGrants={allGroupsGranted()} accountEmail="test@example.com" />)

    await waitFor(() => expect(screen.queryByText('Welcome to Expenses')).toBeNull())

    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]!)
    fireEvent.click(await screen.findByRole('radio', { name: 'Account' }))
    await screen.findByText('test@example.com')
  })
})

describe('ExpensesApp tab wiring', () => {
  it('sends the dashboard nudge to Goals with the check-in form open', async () => {
    const dataset = datasetWith({
      categories: [{ id: 1, name: 'Groceries', monthlyBudgetCents: 30000, sortOrder: 0, active: true }],
      accounts: [{ id: 1, name: 'Main debit', kind: 'debit', settlement: 'immediate', active: true }],
      goalScenarios: [makeScenario({ id: 1, isActive: true })],
      wealthAccounts: [makeWealthAccount({ id: 1, name: 'Broker' })],
    })
    render(<ExpensesApp source={sourceThatSucceeds(dataset)} hubGrants={allGroupsGranted()} />)
    await waitFor(() => expect(screen.queryByText('Welcome to Expenses')).toBeNull())

    fireEvent.click(await screen.findByRole('button', { name: 'Log check-in' }))

    // The Goals tab is a lazy chunk, and CI takes longer than the default second to load it.
    expect(await screen.findByRole('button', { name: 'Save check-in' }, { timeout: 15_000 })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Progress' })).toBeChecked()
  }, 20_000)

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
          status: 'posted',
        },
      ],
    })
    render(<ExpensesApp source={sourceThatSucceeds(dataset)} hubGrants={allGroupsGranted()} />)

    fireEvent.click((await screen.findAllByRole('button', { name: 'Transactions' }))[0]!)

    expect(await screen.findByText('Mercadona')).toBeTruthy()
  })
})

describe('ExpensesApp while selecting transactions', () => {
  const row = (id: number, month: string) => ({
    id,
    date: `${month}-10`,
    budgetMonth: month,
    description: `Row ${id}`,
    accountId: 1,
    categoryId: 1,
    type: 'expense' as const,
    amountCents: 1000,
    cancelled: false,
    status: 'posted' as const,
  })

  const withRows = (transactions: ExpenseDataset['transactions']) =>
    datasetWith({
      categories: [{ id: 1, name: 'Groceries', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
      accounts: [{ id: 1, name: 'Main debit', kind: 'debit', settlement: 'immediate', active: true }],
      transactions,
    })

  // Two months of data, so "Previous month" is enabled on the latest one. `afterRefresh`
  // is what the refresh button loads.
  function twoMonths(afterRefresh?: ExpenseDataset['transactions']) {
    const dataset = withRows([row(1, '2026-06'), row(2, '2026-07')])
    const load = vi.fn().mockResolvedValueOnce(dataset)
    load.mockResolvedValue(afterRefresh ? withRows(afterRefresh) : dataset)
    return {
      ...sourceThatSucceeds(dataset),
      load,
      deleteTransaction: vi.fn().mockResolvedValue(undefined),
      deleteTransactions: vi.fn().mockResolvedValue(0),
      updateTransactions: vi.fn().mockResolvedValue(0),
    }
  }

  async function openTransactions(source = twoMonths()) {
    render(
      <ToastProvider>
        <ExpensesApp source={source} hubGrants={allGroupsGranted()} />
      </ToastProvider>,
    )
    fireEvent.click((await screen.findAllByRole('button', { name: 'Transactions' }))[0]!)
    await screen.findByText('Row 2')
    return () => screen.getByRole('button', { name: 'Previous month' })
  }

  const locked = (el: HTMLElement) => el.getAttribute('aria-disabled') === 'true'

  it('opens the add sheet from the button and closes it from the sheet', async () => {
    await openTransactions()

    fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }))
    expect(screen.getByRole('dialog', { name: 'New transaction' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'New transaction' })).not.toBeInTheDocument()
  })

  it('keeps the add sheet up for its exit after it is closed, then removes it', async () => {
    setMotionDisabledForTests(false)
    try {
      await openTransactions()
      fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }))
      const sheet = screen.getByRole('dialog', { name: 'New transaction' })

      fireEvent.click(screen.getByRole('button', { name: 'Close' }))

      // Still mounted and leaving: the state that closed it is already clear.
      expect(sheet.className).toContain('sheetClosing')
      await waitFor(() => expect(sheet).not.toBeInTheDocument(), { timeout: 1000 })
    } finally {
      setMotionDisabledForTests(true)
    }
  })

  it('holds the month still for as long as rows are being selected', async () => {
    const previous = await openTransactions()
    expect(locked(previous())).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(locked(previous())).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(locked(previous())).toBe(false)
  })

  it('hides the add-transaction FAB while rows are selected, on the same corner as the selection bar', async () => {
    await openTransactions()
    expect(screen.getByRole('button', { name: 'Add transaction' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(screen.queryByRole('button', { name: 'Add transaction' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Add transaction' })).toBeInTheDocument()
  })

  it('says why the month does not change while rows are selected', async () => {
    const previous = await openTransactions()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))

    fireEvent.click(previous())

    expect(screen.getByText('Finish or cancel the selection to change the month')).toBeInTheDocument()
    expect(previous().parentElement).toHaveTextContent('July 2026')
  })

  it('lets go when the selection ends by leaving the tab and coming back', async () => {
    // No handler runs when the tab unmounts. Transactions then comes back with nothing
    // selected, and without the reset the shell would still hold its month locked.
    const previous = await openTransactions()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(locked(previous())).toBe(true)

    fireEvent.click(screen.getAllByRole('button', { name: 'Dashboard' })[0]!)
    expect(locked(previous())).toBe(false)
    fireEvent.click(screen.getAllByRole('button', { name: 'Transactions' })[0]!)
    await screen.findByText('Row 2')

    expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument()
    expect(locked(previous())).toBe(false)
  })

  it('says why search does nothing while rows are selected', async () => {
    await openTransactions()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))

    fireEvent.click(screen.getByRole('button', { name: 'Search is locked while rows are selected' }))

    expect(screen.getByText('Finish or cancel the selection to search or filter')).toBeInTheDocument()
  })

  it('keeps its month when a refresh brings in a newer one mid-selection', async () => {
    // With no month picked the header follows the newest. Mid-selection that would swap
    // July's list for August's, and the locked arrows could not bring July back.
    const previous = await openTransactions(
      twoMonths([row(1, '2026-06'), row(2, '2026-07'), row(3, '2026-08')]),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()

    const refresh = screen.getByRole('button', { name: 'Refresh data' })
    fireEvent.click(refresh)
    await waitFor(() => expect(refresh).toBeEnabled(), { timeout: 3000 })

    expect(previous().parentElement).toHaveTextContent('July 2026')
    expect(screen.getByText('Row 2')).toBeInTheDocument()
    expect(screen.getByText('1 selected')).toBeInTheDocument()

    // Once the selection ends, the header follows the newest month again.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByText('Row 3')).toBeInTheDocument()
    expect(previous().parentElement).toHaveTextContent('August 2026')
  })

  it('keeps the selection when Escape closes the edit sheet', async () => {
    // The sheet and select mode both close on Escape. Backing out of an edit used to
    // clear every chosen row as well.
    await openTransactions()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByText('Edit selected')).toBeInTheDocument()

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByText('Edit selected')).not.toBeInTheDocument())
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('keeps the selection when Escape closes the navigation menu', async () => {
    // The menu comes from folio-shell and does not mark the key as used.
    await openTransactions()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

    // Since folio-shell 1.6.2 the menu fades out over 150ms rather than cutting,
    // so it leaves inert first and unmounts a beat later.
    expect(screen.getByRole('dialog')).toHaveAttribute('inert')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('keeps a way out of select mode when the app goes offline', async () => {
    // Offline is read-only, which used to take away the bar and Cancel while select mode,
    // and the month and filter locks with it, stayed on.
    const previous = await openTransactions()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    expect(screen.getByText('1 selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument()
    expect(locked(previous())).toBe(false)
  })

  it('shows the month you step to when the list was on all dates', async () => {
    // Before, the header moved to June while the list stayed on every month.
    await openTransactions()
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }))
    fireEvent.click(screen.getByRole('radio', { name: 'All' }))
    expect(screen.getByText('Row 1')).toBeInTheDocument()
    expect(screen.getByText('Row 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))

    await waitFor(() => expect(screen.queryByText('Row 2')).not.toBeInTheDocument())
    expect(screen.getByText('Row 1')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Month' })).toBeChecked()
  })
})
