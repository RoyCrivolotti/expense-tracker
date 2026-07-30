import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DateScopeRow } from './TxnFilterRows'

const baseProps = {
  customDateFrom: '',
  customDateTo: '',
  selectMode: false,
  onDateScope: vi.fn(),
  onCustomDateFrom: vi.fn(),
  onCustomDateTo: vi.fn(),
}

describe('DateScopeRow month pills', () => {
  it('shows a month pill per available month when scoped to Month', () => {
    render(
      <DateScopeRow
        {...baseProps}
        dateScope="budgetMonth"
        months={['2026-05', '2026-06', '2026-07']}
        activeMonth="2026-06"
        onMonthChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('radio', { name: 'May' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Jun' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Jul' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Jun' })).toHaveAttribute('aria-checked', 'true')
  })

  it('adds a year suffix once the months span more than one calendar year', () => {
    render(
      <DateScopeRow
        {...baseProps}
        dateScope="budgetMonth"
        months={['2025-12', '2026-01']}
        activeMonth="2026-01"
        onMonthChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('radio', { name: "Dec '25" })).toBeTruthy()
    expect(screen.getByRole('radio', { name: "Jan '26" })).toBeTruthy()
  })

  it('calls onMonthChange when a pill is clicked', () => {
    const onMonthChange = vi.fn()
    render(
      <DateScopeRow
        {...baseProps}
        dateScope="budgetMonth"
        months={['2026-06', '2026-07']}
        activeMonth="2026-06"
        onMonthChange={onMonthChange}
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Jul' }))
    expect(onMonthChange).toHaveBeenCalledWith('2026-07')
  })

  it('hides the pill row outside the Month scope', () => {
    render(
      <DateScopeRow
        {...baseProps}
        dateScope="allDates"
        months={['2026-06', '2026-07']}
        activeMonth="2026-06"
        onMonthChange={vi.fn()}
      />,
    )
    expect(screen.queryByRole('radio', { name: 'Jun' })).toBeNull()
  })

  it('hides the pill row when there are no months yet', () => {
    render(
      <DateScopeRow
        {...baseProps}
        dateScope="budgetMonth"
        months={[]}
        activeMonth=""
        onMonthChange={vi.fn()}
      />,
    )
    expect(screen.queryByRole('radiogroup', { name: 'Budget month' })).toBeNull()
  })
})
