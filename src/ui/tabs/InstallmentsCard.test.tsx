import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset, InstallmentPlan } from '../../types'
import type { ExpenseActions } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { defaultExpenseSettings } from '../../engine'
import { InstallmentsCard } from './InstallmentsCard'

const basePlan: InstallmentPlan = {
  id: 1,
  description: 'Iphone, Cetelam',
  totalCount: 24,
  amountCents: 5783,
  accountId: 2,
  categoryId: 3,
  type: 'expense',
  anchorBudgetMonth: '2027-01',
  startInstallmentIndex: 1,
  active: true,
}

function datasetWithPlans(plans: InstallmentPlan[]): ExpenseDataset {
  return {
    categories: [{ id: 3, name: 'Tech', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
    accounts: [{ id: 2, name: 'Cetelam', kind: 'credit', settlement: 'deferred', active: true }],
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
    installmentPlans: plans,
    settings: defaultExpenseSettings(),
  }
}

function modelWithPlans(plans: InstallmentPlan[]): ExpenseModel {
  return {
    dataset: datasetWithPlans(plans),
    lookup: {
      category: (id) => (id === 3 ? { id: 3, name: 'Tech', monthlyBudgetCents: 0, sortOrder: 0, active: true } : undefined),
      account: () => undefined,
      categoryName: () => 'Tech',
      accountName: () => 'Cetelam',
      installmentPlan: (id) => plans.find((p) => p.id === id),
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
    setStatementPaid: vi.fn(),
    setCashActual: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    updateSettings: vi.fn(),
    updateGoals: vi.fn(),
    createScenario: vi.fn(),
    updateScenario: vi.fn(),
    deleteScenario: vi.fn(),
    createInstallmentPlan: vi.fn(),
    updateInstallmentPlan: vi.fn(),
    deleteInstallmentPlan: vi.fn(),
  }
}

describe('InstallmentsCard', () => {
  it('renders nothing when there are no plans at all', () => {
    const { container } = render(
      <InstallmentsCard model={modelWithPlans([])} actions={noopActions()} month="2026-07" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('still shows the "Manage plans" entry when nothing is due this month', () => {
    // Anchored to a far-future month, so nothing is due for the viewed month.
    render(
      <InstallmentsCard model={modelWithPlans([basePlan])} actions={noopActions()} month="2026-07" />,
    )
    expect(screen.getByText('Manage plans')).toBeTruthy()
    expect(screen.getByText('Nothing due right now.')).toBeTruthy()
  })

  it('shows due payments when the plan has an installment for the viewed month', () => {
    const duePlan: InstallmentPlan = { ...basePlan, anchorBudgetMonth: '2026-07' }
    render(
      <InstallmentsCard model={modelWithPlans([duePlan])} actions={noopActions()} month="2026-07" />,
    )
    expect(screen.getByText('Manage plans')).toBeTruthy()
    expect(screen.getByText(/Payment 1\/24/)).toBeTruthy()
  })

  describe('due-soon filtering for a known due date', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-07-01T12:00:00Z'))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('hides a plan-linked payment due later this month (not due-soon yet)', () => {
      const laterPlan: InstallmentPlan = {
        ...basePlan,
        anchorBudgetMonth: '2026-07',
        dueDayOfMonth: 28,
      }
      render(
        <InstallmentsCard model={modelWithPlans([laterPlan])} actions={noopActions()} month="2026-07" />,
      )
      expect(screen.getByText('Manage plans')).toBeTruthy()
      expect(screen.getByText('Nothing due right now.')).toBeTruthy()
      expect(screen.queryByText(/Payment 1\/24/)).toBeNull()
    })

    it('shows a plan-linked payment due tomorrow', () => {
      const soonPlan: InstallmentPlan = {
        ...basePlan,
        anchorBudgetMonth: '2026-07',
        dueDayOfMonth: 2,
      }
      render(
        <InstallmentsCard model={modelWithPlans([soonPlan])} actions={noopActions()} month="2026-07" />,
      )
      expect(screen.getByText(/Payment 1\/24/)).toBeTruthy()
    })
  })
})
