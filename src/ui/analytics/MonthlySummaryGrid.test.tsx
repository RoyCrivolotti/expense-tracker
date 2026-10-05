import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildExpenseModel } from '../buildExpenseModel'
import { makeDataset, makeTransaction } from '../../testing/factories'
import { MonthlySummaryGrid } from './MonthlySummaryGrid'

function model() {
  return buildExpenseModel(
    makeDataset({
      categories: [
        { id: 1, name: 'Home', monthlyBudgetCents: 50_000, sortOrder: 0, active: true },
        // No budget: the row stays because it has activity, via hasActivity.
        { id: 2, name: 'Misc', monthlyBudgetCents: 0, sortOrder: 1, active: true },
        // No budget and no activity: the row is dropped.
        { id: 3, name: 'Dormant', monthlyBudgetCents: 0, sortOrder: 2, active: true },
      ],
      transactions: [
        makeTransaction({
          id: 1,
          date: '2025-12-05',
          budgetMonth: '2025-12',
          type: 'expense',
          amountCents: 90_000,
        }),
        makeTransaction({
          id: 2,
          date: '2026-01-05',
          budgetMonth: '2026-01',
          type: 'expense',
          amountCents: 10_000,
        }),
        makeTransaction({
          id: 3,
          date: '2026-01-07',
          budgetMonth: '2026-01',
          type: 'expense',
          categoryId: 2,
          amountCents: 2_500,
        }),
      ],
    }),
  )
}

describe('MonthlySummaryGrid', () => {
  it('scopes the YTD column to the calendar year of the selected month', () => {
    render(<MonthlySummaryGrid model={model()} month="2026-01" />)
    expect(screen.getByText('YTD (2026)')).toBeTruthy()
    // All-time would be 1.000 € (900 € of it from December 2025).
    expect(screen.queryByText('1.000,00')).toBeNull()
    // The 2026 YTD is the January spend alone, in the row and the totals row.
    expect(screen.getAllByText('100,00').length).toBeGreaterThan(1)
  })

  it('keeps unbudgeted categories with activity and drops dormant ones', () => {
    render(<MonthlySummaryGrid model={model()} month="2026-01" />)
    expect(screen.getByText('Misc')).toBeTruthy()
    expect(screen.queryByText('Dormant')).toBeNull()
  })
})
