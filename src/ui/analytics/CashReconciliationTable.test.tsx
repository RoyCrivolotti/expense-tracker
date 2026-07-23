import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Account, ExpenseDataset, Transaction } from '../../types'
import { defaultExpenseSettings } from '../../engine'
import type { ExpenseModel } from '../useExpenseData'
import { CashReconciliationTable } from './CashReconciliationTable'

const settings = { ...defaultExpenseSettings(), openingCashCents: 100000 }

const accounts: Account[] = [
  { id: 1, name: 'Debit', kind: 'debit', settlement: 'immediate', active: true },
  { id: 2, name: 'Card', kind: 'credit', settlement: 'deferred', active: true },
]

function txn(partial: Partial<Transaction> & Pick<Transaction, 'budgetMonth' | 'type'>): Transaction {
  return {
    id: partial.id ?? 1,
    date: `${partial.budgetMonth}-01`,
    description: partial.description ?? 'Test',
    accountId: partial.accountId ?? 1,
    categoryId: partial.categoryId ?? 1,
    amountCents: partial.amountCents ?? 1000,
    cancelled: partial.cancelled ?? false,
    status: partial.status ?? 'posted',
    ...partial,
  }
}

function modelWith(transactions: Transaction[], cashActuals: ExpenseDataset['cashActuals']): ExpenseModel {
  return {
    dataset: {
      categories: [{ id: 1, name: 'Misc', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
      accounts,
      transactions,
      accountStatements: [],
      cashActuals,
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
      settings,
    },
    lookup: {
      category: () => undefined,
      account: (id) => accounts.find((a) => a.id === id),
      categoryName: () => 'Misc',
      accountName: (id) => accounts.find((a) => a.id === id)?.name ?? '',
      installmentPlan: () => undefined,
    },
    descriptionIndex: { search: () => [], resolve: () => undefined },
    months: ['2026-01'],
  }
}

describe('CashReconciliationTable', () => {
  it('shows a reconciled checkmark once cash is entered and the card statement is paid', () => {
    const paidCard = txn({
      budgetMonth: '2026-01',
      type: 'expense',
      amountCents: 30000,
      accountId: 2,
      status: 'posted',
    })
    const model = modelWith([paidCard], [{ yearMonth: '2026-01', actualCashCents: 70000 }])
    render(<CashReconciliationTable model={model} />)
    expect(screen.getByTitle('Reconciled: all card statements paid and cash entered')).toBeTruthy()
  })

  it('omits the checkmark when the card statement is still unpaid', () => {
    const unpaidCard = txn({
      budgetMonth: '2026-01',
      type: 'expense',
      amountCents: 30000,
      accountId: 2,
      status: 'forecast',
    })
    const model = modelWith([unpaidCard], [{ yearMonth: '2026-01', actualCashCents: 70000 }])
    render(<CashReconciliationTable model={model} />)
    expect(screen.queryByTitle('Reconciled: all card statements paid and cash entered')).toBeNull()
  })
})
