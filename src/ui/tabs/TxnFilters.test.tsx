import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TxnFilters, type TxnFiltersProps } from './TxnFilters'

function baseProps(overrides: Partial<TxnFiltersProps> = {}): TxnFiltersProps {
  return {
    categories: [],
    accounts: [],
    query: '',
    status: 'all',
    categoryId: 'all',
    accountId: 'all',
    txnType: 'all',
    dateScope: 'budgetMonth',
    customDateFrom: '',
    customDateTo: '',
    selectMode: false,
    canSelect: true,
    secondaryFilterCount: 0,
    hasActiveFilters: false,
    onClearFilters: vi.fn(),
    onQuery: vi.fn(),
    onCategory: vi.fn(),
    onAccount: vi.fn(),
    onStatus: vi.fn(),
    onTxnType: vi.fn(),
    onDateScope: vi.fn(),
    onCustomDateFrom: vi.fn(),
    onCustomDateTo: vi.fn(),
    onToggleSelectMode: vi.fn(),
    ...overrides,
  }
}

describe('TxnFilters', () => {
  it('does not show a Clear filters button when nothing is filtered', () => {
    render(<TxnFilters {...baseProps()} />)
    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument()
  })

  it('shows Clear filters next to the toggle once a filter is active, and clears on click', async () => {
    const user = userEvent.setup()
    const onClearFilters = vi.fn()
    render(
      <TxnFilters
        {...baseProps({
          hasActiveFilters: true,
          secondaryFilterCount: 1,
          categoryId: 3,
          categories: [
            { id: 3, name: 'Groceries', monthlyBudgetCents: 50000, sortOrder: 0, active: true },
          ],
          onClearFilters,
        })}
      />,
    )

    const clearBtn = screen.getByRole('button', { name: 'Clear filters' })
    expect(clearBtn).toBeInTheDocument()
    await user.click(clearBtn)
    expect(onClearFilters).toHaveBeenCalledTimes(1)
  })

  it('shows the active-filter count badge and hides Clear filters in select mode', () => {
    render(
      <TxnFilters
        {...baseProps({
          hasActiveFilters: true,
          secondaryFilterCount: 2,
          selectMode: true,
        })}
      />,
    )
    expect(screen.getByLabelText('2 active filters')).toBeInTheDocument()
    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument()
  })

  it('expands the secondary filter rows on toggle click', async () => {
    const user = userEvent.setup()
    render(<TxnFilters {...baseProps()} />)
    expect(screen.queryByText('Date scope')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Filters/ }))
    expect(screen.getByText('Date scope')).toBeInTheDocument()
  })
})
