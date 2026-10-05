import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildExpenseModel } from '../buildExpenseModel'
import { makeDataset, makeTransaction } from '../../testing/factories'
import { MonthlyTotalsTable } from './MonthlyTotalsTable'

describe('MonthlyTotalsTable', () => {
  it('counts unpaid (forecast) card charges — committed basis, matching the Dashboard', () => {
    const model = buildExpenseModel(
      makeDataset({
        transactions: [
          makeTransaction({ id: 1, budgetMonth: '2026-01', type: 'income', amountCents: 300_000 }),
          makeTransaction({ id: 2, budgetMonth: '2026-01', type: 'expense', amountCents: 100_000 }),
          makeTransaction({
            id: 3,
            budgetMonth: '2026-01',
            type: 'expense',
            amountCents: 50_000,
            status: 'forecast',
          }),
          makeTransaction({
            id: 4,
            date: '2026-02-03',
            budgetMonth: '2026-02',
            type: 'expense',
            amountCents: 20_000,
          }),
        ],
      }),
    )
    render(<MonthlyTotalsTable model={model} />)
    // Expenses = posted 1.000 € + forecast 500 €; the column and totals row agree.
    expect(screen.getAllByText('1.500,00').length).toBeGreaterThan(0)
    expect(screen.queryByText('1.000,00')).toBeNull()
  })
})
