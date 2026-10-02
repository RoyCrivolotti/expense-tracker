import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildExpenseModel } from '../../buildExpenseModel'
import { makeDataset, makeTransaction } from '../../../testing/factories'
import { AnalyticsTabMobile } from './AnalyticsTabMobile'

// The charts read matchMedia, which jsdom does not implement.
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  })
})

function renderAnalytics() {
  const model = buildExpenseModel(makeDataset({ transactions: [makeTransaction({ id: 1 })] }))
  return render(<AnalyticsTabMobile model={model} month="2025-01" onMonthChange={vi.fn()} />)
}

describe('AnalyticsTabMobile', () => {
  it('offers Summary, Totals, Cash and Year as tabs over one panel, opening on Summary', () => {
    renderAnalytics()

    expect(screen.getByRole('tablist', { name: 'Analytics section' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Summary', 'Totals', 'Cash', 'Year'])
    expect(screen.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Summary')
  })

  it('swaps the panel for the section that is tapped', () => {
    renderAnalytics()
    const summary = screen.getByRole('tabpanel').textContent

    fireEvent.click(screen.getByRole('tab', { name: 'Year' }))

    expect(screen.getByRole('tab', { name: 'Year' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Year')
    expect(screen.getByRole('tabpanel').textContent).not.toBe(summary)
  })
})
