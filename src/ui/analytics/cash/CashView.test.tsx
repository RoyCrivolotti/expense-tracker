import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Account, Transaction } from '../../../types'
import { defaultExpenseSettings } from '../../../engine'
import { buildExpenseModel } from '../../buildExpenseModel'
import { makeDataset, makeTransaction } from '../../../testing/factories'
import { CashView } from './CashView'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }),
  })
})

const accounts: Account[] = [
  { id: 1, name: 'Main Debit', kind: 'debit', settlement: 'immediate', active: true },
  { id: 2, name: 'Card', kind: 'credit', settlement: 'deferred', active: true },
]

let nextId = 1
function txn(partial: Partial<Transaction>): Transaction {
  return makeTransaction({ id: nextId++, ...partial })
}

function model() {
  return buildExpenseModel(
    makeDataset({
      settings: { ...defaultExpenseSettings(), openingCashCents: 800_000, openingInvestmentCents: 100_000 },
      accounts,
      accountStatements: [
        { accountId: 2, yearMonth: '2026-01', paid: true },
        { accountId: 2, yearMonth: '2026-02', paid: false },
      ],
      cashActuals: [],
      transactions: [
        txn({ date: '2026-01-01', budgetMonth: '2026-01', type: 'income', amountCents: 300_000 }),
        txn({ date: '2026-01-05', budgetMonth: '2026-01', accountId: 2, amountCents: 20_000 }),
        txn({ date: '2026-01-10', budgetMonth: '2026-01', type: 'investment', amountCents: 40_000 }),
        txn({ date: '2026-02-01', budgetMonth: '2026-02', type: 'income', amountCents: 300_000 }),
        txn({ date: '2026-02-05', budgetMonth: '2026-02', accountId: 2, amountCents: 15_000, status: 'forecast' }),
      ],
    }),
  )
}

describe('CashView', () => {
  it('shows a dot per month and points the banner at the one ready to count', () => {
    render(<CashView model={model()} month="2026-02" openMonth="2026-03" />)
    expect(screen.getByRole('group', { name: 'Month close status' })).toBeInTheDocument()
    // February is selected (the header month) and waiting; January is ready.
    expect(screen.getByText(/January 2026 is ready to count/)).toBeInTheDocument()
    expect(screen.getByText(/card statement is unpaid/)).toBeInTheDocument()
  })

  it('never calls the month under way ready to count', () => {
    // January's statements are paid, but January IS the month under way.
    render(<CashView model={model()} month="2026-02" openMonth="2026-01" />)
    expect(screen.queryByText(/is ready to count/)).toBeNull()
  })

  it('walks the bridge for the month the banner selects, with the count input in place', () => {
    render(<CashView model={model()} month="2026-02" openMonth="2026-03" />)
    fireEvent.click(screen.getByText(/January 2026 is ready to count/))

    expect(screen.getByText('Opening cash')).toBeInTheDocument()
    expect(screen.getByText('Card statements paid')).toBeInTheDocument()
    expect(screen.getByText(/Count the cash you hold/)).toBeInTheDocument()
  })

  it('follows the header month picker even after a dot was tapped', () => {
    const { rerender } = render(<CashView model={model()} month="2026-02" openMonth="2026-03" />)
    // Tap over to January via the banner, then change the header month.
    fireEvent.click(screen.getByText(/January 2026 is ready to count/))
    expect(screen.getByText(/Count the cash you hold/)).toBeInTheDocument()
    rerender(<CashView model={model()} month="2026-02" openMonth="2026-03" />)
    // Same month: the tapped pick stays.
    expect(screen.getByText(/Count the cash you hold/)).toBeInTheDocument()
    rerender(<CashView model={model()} month="2026-01" openMonth="2026-03" />)
    expect(screen.getByText(/Count the cash you hold/)).toBeInTheDocument()
    rerender(<CashView model={model()} month="2026-02" openMonth="2026-03" />)
    // The header moved back to February, so the earlier January tap is forgotten.
    expect(screen.getByText(/card statement is unpaid/)).toBeInTheDocument()
  })

  it('labels the balances as cost and keeps the full table one fold away', () => {
    render(<CashView model={model()} month="2026-01" openMonth="2026-03" />)
    expect(screen.getByText('Invested, at cost')).toBeInTheDocument()
    expect(screen.getByText(/Goals tracks the market value/)).toBeInTheDocument()
    expect(screen.getByText('Full reconciliation table')).toBeInTheDocument()
    // The old "net worth" wording is gone from this view.
    expect(screen.queryByText(/net worth/i)).toBeNull()
  })

  it('tells a month that has not ended apart from one that is ready to count', () => {
    render(<CashView model={model()} month="2026-01" openMonth="2026-02" />)
    expect(screen.getByText(/Statements are paid\. Count the cash/)).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('Feb: not ended yet'))
    expect(screen.getByText(/has not ended yet/)).toBeInTheDocument()
  })

  it('says so when there is no month to reconcile', () => {
    const empty = buildExpenseModel(makeDataset({ accounts, transactions: [], cashActuals: [] }))
    render(<CashView model={empty} month="2026-01" openMonth="2026-01" />)
    expect(screen.getByText('No months to reconcile yet.')).toBeInTheDocument()
  })
})
