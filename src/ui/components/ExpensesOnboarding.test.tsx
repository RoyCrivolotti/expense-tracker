import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseDataSource } from '../../data/dataSource'
import type { ExpenseDataset } from '../../types'
import { defaultExpenseSettings } from '../../engine'
import { ExpensesOnboarding } from './ExpensesOnboarding'

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
    settings: defaultExpenseSettings(),
    ...overrides,
  }
}

function sourceThatSucceeds(): ExpenseDataSource {
  return {
    canWrite: true,
    load: vi.fn(),
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
  fireEvent.click(screen.getByText('Continue')) // step 0 -> money
  fireEvent.click(screen.getByText('Continue')) // money -> categories
  fireEvent.click(screen.getByText('Continue')) // categories -> accounts
  fireEvent.click(screen.getByText('Finish setup'))
  fireEvent.click(screen.getByText('Apply'))
  await waitFor(() => expect(screen.queryByText('Apply these changes?')).toBeNull())
}

describe('ExpensesOnboarding', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ExpensesOnboarding
        open={false}
        source={sourceThatSucceeds()}
        dataset={datasetWith()}
        firstRun={true}
        applyPatch={vi.fn()}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('on first run, finishing the wizard closes it and opens "add a transaction"', async () => {
    const onAdd = vi.fn()
    const onClose = vi.fn()
    render(
      <ExpensesOnboarding
        open={true}
        source={sourceThatSucceeds()}
        dataset={datasetWith()}
        firstRun={true}
        applyPatch={vi.fn()}
        onAdd={onAdd}
        onClose={onClose}
      />,
    )
    await finishWizard()
    expect(onClose).toHaveBeenCalled()
    expect(onAdd).toHaveBeenCalled()
  })

  it('on re-entry, finishing the wizard closes it without opening "add a transaction"', async () => {
    const onAdd = vi.fn()
    const onClose = vi.fn()
    render(
      <ExpensesOnboarding
        open={true}
        source={sourceThatSucceeds()}
        dataset={datasetWith({
          accounts: [{ id: 1, name: 'Existing', kind: 'debit', settlement: 'immediate', active: true }],
        })}
        firstRun={false}
        applyPatch={vi.fn()}
        onAdd={onAdd}
        onClose={onClose}
      />,
    )
    await finishWizard()
    expect(onClose).toHaveBeenCalled()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('skipping never opens "add a transaction", regardless of firstRun', () => {
    const onAdd = vi.fn()
    const onClose = vi.fn()
    render(
      <ExpensesOnboarding
        open={true}
        source={sourceThatSucceeds()}
        dataset={datasetWith()}
        firstRun={true}
        applyPatch={vi.fn()}
        onAdd={onAdd}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByText('Skip for now'))
    expect(onClose).toHaveBeenCalled()
    expect(onAdd).not.toHaveBeenCalled()
  })
})
