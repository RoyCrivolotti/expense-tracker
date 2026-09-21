import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type {
  Account,
  AccountStatement,
  ExpenseDataset,
  InstallmentPlan,
  Transaction,
} from '../../types'
import type { ExpenseActions } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { defaultExpenseSettings } from '../../engine'
import pills from '../components/primitives.module.css'
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

const accounts: Account[] = [
  { id: 2, name: 'Main Debit', kind: 'debit', settlement: 'immediate', active: true },
  { id: 5, name: 'Travel Card', kind: 'credit', settlement: 'deferred', active: true },
]

interface Extras {
  statements?: AccountStatement[]
  accounts?: Account[]
}

function datasetWithPlans(
  plans: InstallmentPlan[],
  transactions: Transaction[] = [],
  extras: Extras = {},
): ExpenseDataset {
  return {
    flags: [],
    attachments: [],
    categories: [{ id: 3, name: 'Tech', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
    accounts: extras.accounts ?? accounts,
    transactions,
    accountStatements: extras.statements ?? [],
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
    wealthAccounts: [],
    wealthCheckins: [],
    settings: defaultExpenseSettings(),
  }
}

function modelWithPlans(
  plans: InstallmentPlan[],
  transactions: Transaction[] = [],
  extras: Extras = {},
): ExpenseModel {
  const accs = extras.accounts ?? accounts
  return {
    dataset: datasetWithPlans(plans, transactions, extras),
    lookup: {
      category: (id) => (id === 3 ? { id: 3, name: 'Tech', monthlyBudgetCents: 0, sortOrder: 0, active: true } : undefined),
      account: (id) => accs.find((a) => a.id === id),
      flag: () => undefined,
      attachments: () => [],
      categoryName: () => 'Tech',
      accountName: (id) => accs.find((a) => a.id === id)?.name ?? 'Unknown',
      installmentPlan: (id) => plans.find((p) => p.id === id),
      settlementFor: () => undefined,
      settledBy: () => [],
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
    updateTransactions: vi.fn(),
    setStatementPaid: vi.fn(),
    setCashActual: vi.fn(),
    uploadAttachment: vi.fn(),
    deleteAttachment: vi.fn(),
    createFlag: vi.fn(),
    updateFlag: vi.fn(),
    deleteFlag: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    updateSettings: vi.fn(),
    updateGoals: vi.fn(),
    createScenario: vi.fn(),
    updateScenario: vi.fn(),
    deleteScenario: vi.fn(),
    createInstallmentPlan: vi.fn(),
    updateInstallmentPlan: vi.fn(),
    deleteInstallmentPlan: vi.fn(),
    createWealthAccount: vi.fn(),
    updateWealthAccount: vi.fn(),
    deleteWealthAccount: vi.fn(),
    createWealthCheckin: vi.fn(),
    updateWealthCheckin: vi.fn(),
    deleteWealthCheckin: vi.fn(),
  }
}

describe('InstallmentsCard', () => {
  it('renders nothing when there are no plans at all', () => {
    const { container } = render(
      <InstallmentsCard model={modelWithPlans([])} actions={noopActions()} month="2026-07" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('still shows the "Manage plans" entry when nothing is scheduled this month', () => {
    // Anchored to a far-future month, so nothing is scheduled for the viewed month.
    render(
      <InstallmentsCard model={modelWithPlans([basePlan])} actions={noopActions()} month="2026-07" />,
    )
    expect(screen.getByText('Manage plans')).toBeTruthy()
    expect(screen.getByText('Nothing scheduled this month.')).toBeTruthy()
  })

  it('shows due payments when the plan has an installment for the viewed month, with no due day set', () => {
    const duePlan: InstallmentPlan = { ...basePlan, anchorBudgetMonth: '2026-07' }
    render(
      <InstallmentsCard model={modelWithPlans([duePlan])} actions={noopActions()} month="2026-07" />,
    )
    expect(screen.getByText('Manage plans')).toBeTruthy()
    expect(
      screen.getByText('Scheduled plan payments for this month, not predictions.'),
    ).toBeTruthy()
    expect(screen.getByText('1/24')).toBeTruthy()
    expect(screen.getByText('Due this month')).toBeTruthy()
  })

  describe('payments with a known due date (near or far)', () => {
    it('shows a plan-linked payment due later this month, with its exact due date', () => {
      const laterPlan: InstallmentPlan = {
        ...basePlan,
        anchorBudgetMonth: '2026-07',
        dueDayOfMonth: 28,
      }
      render(
        <InstallmentsCard model={modelWithPlans([laterPlan])} actions={noopActions()} month="2026-07" />,
      )
      expect(screen.getByText('Manage plans')).toBeTruthy()
      expect(screen.getByText('1/24')).toBeTruthy()
      expect(screen.getByText(/Due 28 Jul/)).toBeTruthy()
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
      expect(screen.getByText('1/24')).toBeTruthy()
      expect(screen.getByText(/Due 2 Jul/)).toBeTruthy()
    })
  })

  describe('a plan whose first installment was dated the month before its budget month', () => {
    const plan: InstallmentPlan = { ...basePlan, anchorBudgetMonth: '2026-07', dueDayOfMonth: 28 }
    const firstTxn: Transaction = {
      id: 601,
      date: '2026-06-28',
      budgetMonth: '2026-07',
      description: 'Iphone, Cetelam',
      accountId: 2,
      categoryId: 3,
      type: 'expense',
      amountCents: 5783,
      cancelled: false,
      planId: 1,
      installmentIndex: 1,
      status: 'posted',
    }

    it('shows the next payment on the calendar date it will actually post', () => {
      render(
        <InstallmentsCard
          model={modelWithPlans([plan], [firstTxn])}
          actions={noopActions()}
          month="2026-08"
        />,
      )
      expect(screen.getByText('2/24')).toBeTruthy()
      expect(screen.getByText(/Due 28 Jul/)).toBeTruthy()
    })

    it('seeds the transaction with that date and the installment\'s budget month', async () => {
      const actions = noopActions()
      render(
        <InstallmentsCard model={modelWithPlans([plan], [firstTxn])} actions={actions} month="2026-08" />,
      )
      await userEvent.click(screen.getByLabelText('Log installment payment for Iphone, Cetelam'))
      expect(actions.onAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          date: '2026-07-28',
          budgetMonth: '2026-08',
          planId: 1,
          installmentIndex: 2,
        }),
      )
    })
  })

  describe('an installment already paid this month', () => {
    const paidPlan: InstallmentPlan = { ...basePlan, anchorBudgetMonth: '2026-07' }
    const paidTxn: Transaction = {
      id: 501,
      date: '2026-07-05',
      budgetMonth: '2026-07',
      description: 'Iphone, Cetelam',
      accountId: 2,
      categoryId: 3,
      type: 'expense',
      amountCents: 5783,
      cancelled: false,
      planId: 1,
      installmentIndex: 1,
      status: 'posted',
    }

    it('shows a paid indicator with the real payment date instead of the due row', () => {
      render(
        <InstallmentsCard
          model={modelWithPlans([paidPlan], [paidTxn])}
          actions={noopActions()}
          month="2026-07"
        />,
      )
      expect(screen.getByText('Paid 5 Jul')).toBeTruthy()
      expect(screen.queryByText(/^Due/)).toBeNull()
      expect(screen.queryByLabelText(/Log installment payment/)).toBeNull()
    })

    it('does not show a Forecast pill once the underlying charge has posted', () => {
      render(
        <InstallmentsCard
          model={modelWithPlans([paidPlan], [paidTxn])}
          actions={noopActions()}
          month="2026-07"
        />,
      )
      expect(screen.queryByText(/^Forecast/)).toBeNull()
    })

    it('opens the underlying transaction when the paid row is clicked', async () => {
      const actions = noopActions()
      render(
        <InstallmentsCard
          model={modelWithPlans([paidPlan], [paidTxn])}
          actions={actions}
          month="2026-07"
        />,
      )
      await userEvent.click(screen.getByRole('button', { name: /Paid 5 Jul/ }))
      expect(actions.onEdit).toHaveBeenCalledWith(paidTxn)
    })

    it('does not treat a cancelled linked transaction as paid', () => {
      const cancelledTxn: Transaction = { ...paidTxn, cancelled: true }
      render(
        <InstallmentsCard
          model={modelWithPlans([paidPlan], [cancelledTxn])}
          actions={noopActions()}
          month="2026-07"
        />,
      )
      expect(screen.queryByText(/^Paid/)).toBeNull()
      expect(screen.getByText('Due this month')).toBeTruthy()
    })
  })

  describe('the row layout', () => {
    const plan: InstallmentPlan = { ...basePlan, anchorBudgetMonth: '2026-07', dueDayOfMonth: 28 }

    it('shows position, account type, last payment month and one status pill', () => {
      render(
        <InstallmentsCard model={modelWithPlans([plan])} actions={noopActions()} month="2026-07" />,
      )
      expect(screen.getByText('1/24')).toBeTruthy()
      expect(screen.getByText('Debit')).toBeTruthy()
      // Once in the desktop header, once in the row so a screen reader still hears it.
      expect(screen.getAllByText('Last payment')).toHaveLength(2)
      expect(screen.getByText('Jun 2028')).toBeTruthy()
      expect(screen.getByText('Due 28 Jul')).toBeTruthy()
    })

    it('labels the desktop columns with a header that assistive tech skips', () => {
      render(
        <InstallmentsCard model={modelWithPlans([plan])} actions={noopActions()} month="2026-07" />,
      )
      const status = screen.getByText('Status')
      expect(status.parentElement?.getAttribute('aria-hidden')).toBe('true')
      expect(screen.getByText('Plan')).toBeTruthy()
      expect(screen.getByText('Account')).toBeTruthy()
      expect(screen.getByText('Amount')).toBeTruthy()
    })

    it('has no column header when nothing is scheduled', () => {
      render(
        <InstallmentsCard
          model={modelWithPlans([{ ...plan, anchorBudgetMonth: '2027-01' }])}
          actions={noopActions()}
          month="2026-07"
        />,
      )
      expect(screen.queryByText('Status')).toBeNull()
    })

    it('leaves the account chip off when the account is unknown', () => {
      const orphan: InstallmentPlan = { ...plan, accountId: 99 }
      render(
        <InstallmentsCard model={modelWithPlans([orphan])} actions={noopActions()} month="2026-07" />,
      )
      expect(screen.queryByText('Debit')).toBeNull()
      expect(screen.queryByText('Credit')).toBeNull()
      expect(screen.getByText('Jun 2028')).toBeTruthy()
    })
  })

  describe('row semantics', () => {
    const dueA: InstallmentPlan = {
      ...basePlan,
      id: 11,
      description: 'Phone',
      anchorBudgetMonth: '2026-07',
      dueDayOfMonth: 12,
    }
    const dueB: InstallmentPlan = { ...dueA, id: 12, description: 'Sofa' }

    it('reads the position with its unit for screen readers', () => {
      render(
        <InstallmentsCard model={modelWithPlans([dueA])} actions={noopActions()} month="2026-07" />,
      )
      expect(screen.getByText('1/24').textContent).toBe('Payment 1/24')
    })

    it('names the plan on each plus button so two due plans are told apart', () => {
      render(
        <InstallmentsCard
          model={modelWithPlans([dueA, dueB])}
          actions={noopActions()}
          month="2026-07"
        />,
      )
      expect(screen.getByLabelText('Log installment payment for Phone')).toBeTruthy()
      expect(screen.getByLabelText('Log installment payment for Sofa')).toBeTruthy()
    })

    it('tones Due and Forecast as warnings and Paid as success', () => {
      const creditPlan: InstallmentPlan = {
        ...basePlan,
        id: 13,
        description: 'Desk',
        accountId: 5,
        anchorBudgetMonth: '2026-07',
      }
      const forecastCharge: Transaction = {
        id: 801,
        date: '2026-06-06',
        budgetMonth: '2026-07',
        description: 'Desk',
        accountId: 5,
        categoryId: 3,
        type: 'expense',
        amountCents: 5783,
        cancelled: false,
        planId: 13,
        installmentIndex: 1,
        status: 'forecast',
      }
      const debitPlan: InstallmentPlan = { ...dueA, id: 14, description: 'Lamp' }
      const paidDebit: Transaction = {
        ...forecastCharge,
        id: 802,
        description: 'Lamp',
        accountId: 2,
        planId: 14,
        status: 'posted',
        date: '2026-07-05',
      }
      render(
        <InstallmentsCard
          model={modelWithPlans([dueA, creditPlan, debitPlan], [forecastCharge, paidDebit])}
          actions={noopActions()}
          month="2026-07"
        />,
      )
      expect(screen.getByText('Due 12 Jul').className).toContain(pills.warning!)
      expect(screen.getByText('Forecast for Jul').className).toContain(pills.warning!)
      expect(screen.getByText('Paid 5 Jul').className).toContain(pills.success!)
    })

    it('takes the Debit or Credit chip from the settlement type, not the stored kind', () => {
      const odd: Account[] = [
        { id: 2, name: 'Odd card', kind: 'debit', settlement: 'deferred', active: true },
      ]
      render(
        <InstallmentsCard
          model={modelWithPlans([dueA], [], { accounts: odd })}
          actions={noopActions()}
          month="2026-07"
        />,
      )
      expect(screen.getByText('Credit')).toBeTruthy()
      expect(screen.queryByText('Debit')).toBeNull()
    })

    it('ignores statements for another card or another month when dating a paid card charge', () => {
      const cardPlan: InstallmentPlan = {
        ...basePlan,
        id: 15,
        description: 'Chair',
        accountId: 5,
        anchorBudgetMonth: '2026-07',
      }
      const postedCharge: Transaction = {
        id: 803,
        date: '2026-06-06',
        budgetMonth: '2026-07',
        description: 'Chair',
        accountId: 5,
        categoryId: 3,
        type: 'expense',
        amountCents: 5783,
        cancelled: false,
        planId: 15,
        installmentIndex: 1,
        status: 'posted',
      }
      const statements: AccountStatement[] = [
        { accountId: 2, yearMonth: '2026-07', paid: true, paidOn: '2026-08-09' },
        { accountId: 5, yearMonth: '2026-06', paid: true, paidOn: '2026-07-03' },
      ]
      render(
        <InstallmentsCard
          model={modelWithPlans([cardPlan], [postedCharge], { statements })}
          actions={noopActions()}
          month="2026-07"
        />,
      )
      expect(screen.getByText('Paid')).toBeTruthy()
      expect(screen.queryByText(/Paid \d/)).toBeNull()
    })
  })

  describe('an installment on a credit card', () => {
    const plan: InstallmentPlan = {
      ...basePlan,
      accountId: 5,
      anchorBudgetMonth: '2026-07',
      dueDayOfMonth: 6,
    }
    const charge: Transaction = {
      id: 701,
      date: '2026-06-06',
      budgetMonth: '2026-07',
      description: 'Iphone, Cetelam',
      accountId: 5,
      categoryId: 3,
      type: 'expense',
      amountCents: 5783,
      cancelled: false,
      planId: 1,
      installmentIndex: 1,
      status: 'forecast',
    }

    it('reads as a single Forecast for its budget month until the statement is paid', () => {
      render(
        <InstallmentsCard
          model={modelWithPlans([plan], [charge])}
          actions={noopActions()}
          month="2026-07"
        />,
      )
      expect(screen.getByText('Forecast for Jul')).toBeTruthy()
      expect(screen.getByText('Credit')).toBeTruthy()
      expect(screen.queryByText(/^Paid/)).toBeNull()
      expect(screen.queryByLabelText(/Log installment payment/)).toBeNull()
    })

    it('shows the day the statement was paid, not the day of the charge', () => {
      const paidCharge: Transaction = { ...charge, status: 'posted' }
      const statements: AccountStatement[] = [
        { accountId: 5, yearMonth: '2026-07', paid: true, paidOn: '2026-08-01' },
      ]
      render(
        <InstallmentsCard
          model={modelWithPlans([plan], [paidCharge], { statements })}
          actions={noopActions()}
          month="2026-07"
        />,
      )
      expect(screen.getByText('Paid 1 Aug')).toBeTruthy()
      expect(screen.queryByText(/Paid 6 Jun/)).toBeNull()
    })

    it('shows plain Paid when the statement has no recorded payment day', () => {
      const paidCharge: Transaction = { ...charge, status: 'posted' }
      const statements: AccountStatement[] = [{ accountId: 5, yearMonth: '2026-07', paid: true }]
      render(
        <InstallmentsCard
          model={modelWithPlans([plan], [paidCharge], { statements })}
          actions={noopActions()}
          month="2026-07"
        />,
      )
      expect(screen.getByText('Paid')).toBeTruthy()
    })
  })
})
