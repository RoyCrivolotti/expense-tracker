import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildExpenseModel } from '../buildExpenseModel'
import { makeDataset, makeTransaction } from '../../testing/factories'
import { AnalyticsShell } from './AnalyticsShell'

// The charts read matchMedia, which jsdom does not implement.
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

function renderShell() {
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
      ],
    }),
  )
  return render(<AnalyticsShell model={model} month="2026-01" />)
}

describe('AnalyticsShell', () => {
  it('offers Overview, Spending and Cash as tabs over one panel, opening on Overview', () => {
    renderShell()

    expect(screen.getByRole('tablist', { name: 'Analytics view' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Overview',
      'Spending',
      'Cash',
    ])
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Overview')
  })

  it('swaps the panel for the view that is tapped', () => {
    renderShell()
    const overview = screen.getByRole('tabpanel').textContent

    fireEvent.click(screen.getByRole('tab', { name: 'Cash' }))

    expect(screen.getByRole('tab', { name: 'Cash' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Cash')
    expect(screen.getByRole('tabpanel').textContent).not.toBe(overview)
  })

  it('defaults to the committed basis and recomputes when switched to paid only', () => {
    renderShell()

    // Committed: January expenses are posted 1.000 € + forecast 500 €.
    expect(screen.getAllByText('1.500,00').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('radio', { name: 'Paid only' }))

    expect(screen.queryByText('1.500,00')).toBeNull()
    expect(screen.getAllByText('1.000,00').length).toBeGreaterThan(0)
  })

  it('offers no basis toggle on Cash, which is paid-basis by nature', () => {
    renderShell()
    expect(screen.getByRole('radiogroup', { name: 'Spending basis' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Cash' }))

    expect(screen.queryByRole('radiogroup', { name: 'Spending basis' })).toBeNull()
  })
})

describe('AnalyticsShell on a phone', () => {
  it('serves the same three views with the phone variants of each panel', () => {
    // useIsMobile reads (max-width: 767px); matching it renders the phone panels.
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query === '(max-width: 767px)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    renderShell()

    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Overview',
      'Spending',
      'Cash',
    ])

    fireEvent.click(screen.getByRole('tab', { name: 'Spending' }))
    expect(screen.getByText('Budget vs actual')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Cash' }))
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Cash')
  })
})
