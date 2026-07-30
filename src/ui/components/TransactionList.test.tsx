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

  it('stays quiet when one month is on screen and the dates agree with it', () => {
    render(
      <TransactionList
        rows={rows(
          txn({ id: 1, date: '2026-07-15', budgetMonth: '2026-07' }),
          txn({ id: 2, date: '2026-07-20', budgetMonth: '2026-07' }),
        )}
        lookup={lookup}
      />,
    )
    expect(screen.queryByText("Jul '26")).toBeNull()
  })

  it('flags a row charged to a month other than the one its date falls in', () => {
    render(
      <TransactionList
        rows={rows(
          txn({ id: 1, date: '2026-08-05', budgetMonth: '2026-08' }),
          txn({ id: 2, date: '2026-07-31', budgetMonth: '2026-08' }),
        )}
        lookup={lookup}
      />,
    )
    // One budget month on screen, so only the row that rolled over earns a pill.
    expect(screen.getAllByText("Aug '26")).toHaveLength(1)
  })

  it('spells the budget month out in full on hover', () => {
    render(
      <TransactionList
        rows={rows(txn({ date: '2026-07-31', budgetMonth: '2026-08' }))}
        lookup={lookup}
      />,
    )
    expect(screen.getByText("Aug '26")).toHaveAttribute('title', 'Budget month: August 2026')
  })

  it('counts statement-payment rows towards the month span', () => {
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
    expect(screen.getByText("Jul '26")).toBeTruthy()
  })
})
