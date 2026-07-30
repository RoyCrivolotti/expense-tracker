import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Transaction } from '../../types'
import type { TransactionListRow } from '../../engine'
import { buildLookup } from '../format'
import { makeDataset } from '../../testing/factories'
import { TransactionList } from './TransactionList'

const lookup = buildLookup(
  makeDataset({
    categories: [
      { id: 1, name: 'Investments', monthlyBudgetCents: 0, sortOrder: 0, active: true },
    ],
    accounts: [
      { id: 1, name: 'Santander Debit', kind: 'debit', settlement: 'immediate', active: true },
    ],
  }),
)

function txn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 1,
    date: '2026-07-15',
    budgetMonth: '2026-07',
    description: 'Degiro',
    accountId: 1,
    categoryId: 1,
    type: 'investment',
    amountCents: 250_000,
    cancelled: false,
    status: 'posted',
    ...overrides,
  }
}

function rows(...transactions: Transaction[]): TransactionListRow[] {
  return transactions.map((t) => ({ kind: 'transaction' as const, txn: t }))
}

describe('TransactionList budget month pill', () => {
  it('labels every row of a single-month list, even where the dates agree with it', () => {
    render(
      <TransactionList
        rows={rows(
          txn({ id: 1, date: '2026-07-15', budgetMonth: '2026-07' }),
          txn({ id: 2, date: '2026-07-20', budgetMonth: '2026-07' }),
        )}
        lookup={lookup}
      />,
    )
    expect(screen.getAllByText("Jul '26")).toHaveLength(2)
  })

  it('labels every row once the list mixes budget months', () => {
    render(
      <TransactionList
        rows={rows(
          txn({ id: 1, date: '2026-07-15', budgetMonth: '2026-07' }),
          txn({ id: 2, date: '2026-06-10', budgetMonth: '2026-06' }),
        )}
        lookup={lookup}
      />,
    )
    expect(screen.getByText("Jul '26")).toBeTruthy()
    expect(screen.getByText("Jun '26")).toBeTruthy()
  })

  it('keeps the amount and both badges in the right rail, off the meta line', () => {
    render(<TransactionList rows={rows(txn({ status: 'forecast' }))} lookup={lookup} />)
    const rail = screen.getByText("Jul '26").closest<HTMLElement>('[class*="amountRail"]')
    expect(rail).toContainElement(screen.getByText(/2\.500,00/))
    expect(rail).toContainElement(screen.getByText('Forecast'))
    expect(rail).not.toContainElement(screen.getByText('Investments · Santander Debit'))
  })

  it('names the budget month, not the calendar month the date falls in', () => {
    render(
      <TransactionList
        rows={rows(txn({ date: '2026-07-31', budgetMonth: '2026-08' }))}
        lookup={lookup}
      />,
    )
    expect(screen.getByText("Aug '26")).toHaveAttribute('title', 'Budget month: August 2026')
    expect(screen.queryByText("Jul '26")).toBeNull()
  })

  it('labels rows in the flat layout too, as the dashboard recent-activity list uses', () => {
    render(
      <TransactionList
        rows={rows(
          txn({ id: 1, date: '2026-07-15', budgetMonth: '2026-07' }),
          txn({ id: 2, date: '2026-06-10', budgetMonth: '2026-06' }),
        )}
        lookup={lookup}
        flat
        showDate
      />,
    )
    expect(screen.getByText("Jul '26")).toBeTruthy()
    expect(screen.getByText("Jun '26")).toBeTruthy()
  })

  it('leaves statement-payment rows alone, since they spell their month out already', () => {
    render(
      <TransactionList
        rows={[
          { kind: 'transaction', txn: txn({ date: '2026-07-15', budgetMonth: '2026-07' }) },
          {
            kind: 'statement-payment',
            key: '2:2026-06',
            date: '2026-06-15',
            budgetMonth: '2026-06',
            cardAccountId: 2,
            debitAccountId: 1,
            amountCents: 137_345,
            cardName: 'Iberia Icon',
          },
        ]}
        lookup={lookup}
      />,
    )
    expect(screen.getAllByText("Jul '26")).toHaveLength(1)
    expect(screen.queryByText("Jun '26")).toBeNull()
    expect(screen.getByText(/June 2026/)).toBeTruthy()
  })
})
