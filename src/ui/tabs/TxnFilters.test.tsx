import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TxnFilters, type TxnFiltersProps } from './TxnFilters'

function baseProps(overrides: Partial<TxnFiltersProps> = {}): TxnFiltersProps {
  return {
    categories: [],
    flags: [],
    labels: [],
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
    flagId: 'all',
    onFlag: vi.fn(),
    labelIds: [],
    onLabelIds: vi.fn(),
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
  it('answers a press on anything the selection locks with the reason', async () => {
    const user = userEvent.setup()
    const onLockedPress = vi.fn()
    const onQuery = vi.fn()
    render(
      <TxnFilters
        {...baseProps({
          selectMode: true,
          dateScope: 'last3Months',
          secondaryFilterCount: 1,
          hasActiveFilters: true,
          onLockedPress,
          onQuery,
        })}
      />,
    )

    const toggle = screen.getByRole('button', { name: /Filters/ })
    expect(toggle).toHaveAttribute('aria-disabled', 'true')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(screen.getByRole('button', { name: /Dates: last 3 months/ }))
    await user.click(screen.getByRole('button', { name: 'Search is locked while rows are selected' }))

    expect(onLockedPress).toHaveBeenCalledTimes(3)
    expect(onQuery).not.toHaveBeenCalled()
  })

  it('covers the open filter panel while rows are selected', async () => {
    // The selects and date fields are disabled, and a disabled field never hears the tap.
    const user = userEvent.setup()
    const onLockedPress = vi.fn()
    const { rerender } = render(<TxnFilters {...baseProps({ onLockedPress })} />)
    await user.click(screen.getByRole('button', { name: /Filters/ }))
    expect(screen.queryByRole('button', { name: /Filters are locked/ })).not.toBeInTheDocument()

    rerender(<TxnFilters {...baseProps({ onLockedPress, selectMode: true })} />)
    await user.click(screen.getByRole('button', { name: 'Filters are locked while rows are selected' }))

    expect(onLockedPress).toHaveBeenCalledTimes(1)
  })

  it('leaves search and filters alone when nothing is selected', () => {
    render(<TxnFilters {...baseProps()} />)
    expect(screen.queryByRole('button', { name: /locked while rows are selected/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Filters/ })).not.toHaveAttribute('aria-disabled')
  })

  it('offers Cancel for a selection under way even without write access', () => {
    render(<TxnFilters {...baseProps({ selectMode: true, canSelect: false })} />)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })

  it('offers no Select without write access', () => {
    render(<TxnFilters {...baseProps({ canSelect: false })} />)
    expect(screen.queryByRole('button', { name: 'Select' })).not.toBeInTheDocument()
  })

  it('offers Cancel while selecting, except while a bulk action is running', () => {
    const { rerender } = render(<TxnFilters {...baseProps({ selectMode: true })} />)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()

    rerender(<TxnFilters {...baseProps({ selectMode: true, selectBusy: true })} />)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

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

  it('offers no label filter when there are no labels to filter by', async () => {
    const user = userEvent.setup()
    render(<TxnFilters {...baseProps({ labels: [] })} />)
    await user.click(screen.getByRole('button', { name: /Filters/ }))

    expect(screen.queryByRole('button', { name: 'Labels' })).not.toBeInTheDocument()
  })

  it('picks up a label from the filter picker without closing it', async () => {
    const user = userEvent.setup()
    const onLabelIds = vi.fn()
    render(
      <TxnFilters
        {...baseProps({
          labels: [
            { id: 10, name: 'Madrid trip', color: '#f59e0b', sortOrder: 0, active: true },
          ],
          onLabelIds,
        })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /Filters/ }))
    await user.click(screen.getByRole('button', { name: 'Labels' }))
    const dialog = screen.getByRole('dialog', { name: 'Choose labels' })
    await user.click(within(dialog).getByRole('button', { name: /Madrid trip/ }))

    expect(onLabelIds).toHaveBeenCalledWith([10])
    expect(dialog).toBeInTheDocument()
  })

  it('shows a count on the trigger once more than one label is selected', async () => {
    const user = userEvent.setup()
    render(
      <TxnFilters
        {...baseProps({
          labels: [
            { id: 10, name: 'Madrid trip', color: '#f59e0b', sortOrder: 0, active: true },
            { id: 11, name: 'Moving', color: '#10b981', sortOrder: 1, active: true },
          ],
          labelIds: [10, 11],
        })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /Filters/ }))

    expect(screen.getByRole('button', { name: 'Labels (2)' })).toBeInTheDocument()
  })

  it('closes the label picker from its own Done button', async () => {
    const user = userEvent.setup()
    render(
      <TxnFilters
        {...baseProps({
          labels: [
            { id: 10, name: 'Madrid trip', color: '#f59e0b', sortOrder: 0, active: true },
          ],
        })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /Filters/ }))
    await user.click(screen.getByRole('button', { name: 'Labels' }))
    const dialog = screen.getByRole('dialog', { name: 'Choose labels' })
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))

    expect(screen.queryByRole('dialog', { name: 'Choose labels' })).not.toBeInTheDocument()
  })

  it('names the selected label on the trigger and unpicks it on a second click', async () => {
    const user = userEvent.setup()
    const onLabelIds = vi.fn()
    render(
      <TxnFilters
        {...baseProps({
          labels: [
            { id: 10, name: 'Madrid trip', color: '#f59e0b', sortOrder: 0, active: true },
          ],
          labelIds: [10],
          onLabelIds,
        })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /Filters/ }))

    expect(screen.getByRole('button', { name: 'Madrid trip' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Madrid trip' }))
    const dialog = screen.getByRole('dialog', { name: 'Choose labels' })
    await user.click(within(dialog).getByRole('button', { name: /Madrid trip/ }))

    expect(onLabelIds).toHaveBeenCalledWith([])
  })
})
