import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { NetWorthHistoryChart } from './NetWorthHistoryChart'
import type { WealthAccount, WealthCheckin } from '../../../../types'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

const accounts: WealthAccount[] = [
  { id: 1, name: 'Broker', kind: 'investment', sortOrder: 0, archived: false },
  { id: 2, name: 'Savings', kind: 'cash', sortOrder: 1, archived: false },
]

function checkin(id: number, date: string, broker: number, savings: number): WealthCheckin {
  return {
    id,
    checkinDate: date,
    createdAt: `${date}T00:00:00.000Z`,
    entries: [
      { accountId: 1, valueCents: broker },
      { accountId: 2, valueCents: savings },
    ],
  }
}

/** Local calendar date `n` months of thirty days ago; zero is today, on the axis's right edge. */
function monthsAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n * 30)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

describe('NetWorthHistoryChart', () => {
  it('renders nothing with no check-ins', () => {
    const { container } = render(<NetWorthHistoryChart checkins={[]} accounts={accounts} />)
    expect(container.firstChild).toBeNull()
  })

  it('asks for a second check-in before drawing anything', () => {
    render(
      <NetWorthHistoryChart checkins={[checkin(1, monthsAgo(1), 100, 50)]} accounts={accounts} />,
    )
    expect(screen.getByText(/Log a second check-in/)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('says balances are as logged, since the plan chart beside it is in today\'s money', () => {
    render(
      <NetWorthHistoryChart
        checkins={[checkin(1, monthsAgo(6), 100_000_00, 20_000_00), checkin(2, monthsAgo(3), 110_000_00, 25_000_00)]}
        accounts={accounts}
      />,
    )
    expect(screen.getByText('Balances as logged, in the money of each day.')).toBeInTheDocument()
  })

  it('joins the check-ins as net worth and invested lines on a calendar axis', () => {
    const checkins = [
      checkin(1, monthsAgo(6), 100_000_00, 20_000_00),
      checkin(2, monthsAgo(3), 110_000_00, 25_000_00),
      checkin(3, monthsAgo(0), 125_000_00, 20_000_00),
    ]
    const { container } = render(<NetWorthHistoryChart checkins={checkins} accounts={accounts} />)

    expect(screen.getByRole('img', { name: 'Net worth and invested balance by check-in' })).toBeInTheDocument()
    // Three readings, two series, each joined: six dots and two connecting paths.
    expect(container.querySelectorAll('circle')).toHaveLength(6)
    expect(container.querySelectorAll('path[class*="scatterLine"]')).toHaveLength(2)
    expect(screen.getByText('Net worth')).toBeInTheDocument()
    expect(screen.getByText('Invested')).toBeInTheDocument()
    // Six months of readings fit the default one-year window.
    expect(screen.getByRole('radio', { name: '1Y' })).toBeChecked()

    // Focusing the last step names both readings in the tooltip, alongside the legend.
    fireEvent.keyDown(screen.getByRole('img'), { key: 'End' })
    expect(screen.getAllByText('Net worth')).toHaveLength(2)
    expect(screen.getAllByText('Invested')).toHaveLength(2)
  })

  it('names the nearest reading by its date from a step that has none of its own', () => {
    const checkins = [checkin(1, monthsAgo(11), 100_000_00, 20_000_00), checkin(2, monthsAgo(0), 125_000_00, 20_000_00)]
    render(<NetWorthHistoryChart checkins={checkins} accounts={accounts} />)
    // The middle of a one-year window is months from either reading.
    fireEvent.keyDown(screen.getByRole('img'), { key: 'Home' })
    fireEvent.keyDown(screen.getByRole('img'), { key: 'ArrowRight' })
    fireEvent.keyDown(screen.getByRole('img'), { key: 'ArrowRight' })
    fireEvent.keyDown(screen.getByRole('img'), { key: 'ArrowRight' })
    fireEvent.keyDown(screen.getByRole('img'), { key: 'ArrowRight' })
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent(/Net worth, \d{1,2} \w{3} \d{4}/)
    expect(tooltip).toHaveTextContent(/Invested, \d{1,2} \w{3} \d{4}/)
  })

  it('adds an assets line once a debt is logged, so a mortgage does not read as a loss', () => {
    const withMortgage = [...accounts, { id: 3, name: 'Mortgage', kind: 'debt' as const, sortOrder: 2, archived: false }]
    const before = checkin(1, monthsAgo(3), 100_000_00, 50_000_00)
    const bought: WealthCheckin = {
      ...checkin(2, monthsAgo(0), 100_000_00, 10_000_00),
      entries: [
        { accountId: 1, valueCents: 100_000_00 },
        { accountId: 2, valueCents: 10_000_00 },
        { accountId: 3, valueCents: 300_000_00 },
      ],
    }
    const { container, rerender } = render(<NetWorthHistoryChart checkins={[before, bought]} accounts={withMortgage} />)

    expect(screen.getByText('Assets')).toBeInTheDocument()
    expect(container.querySelectorAll('circle')).toHaveLength(6)
    expect(screen.getByRole('img', { name: /assets/ })).toBeInTheDocument()

    // The same accounts with no debt balance logged: two lines, as before.
    rerender(<NetWorthHistoryChart checkins={[before, checkin(2, monthsAgo(0), 110_000_00, 10_000_00)]} accounts={withMortgage} />)
    expect(screen.queryByText('Assets')).not.toBeInTheDocument()
    expect(container.querySelectorAll('circle')).toHaveLength(4)
  })

  it('drops readings outside a narrower window and widens on request', () => {
    const checkins = [
      checkin(1, monthsAgo(30), 100_000_00, 0),
      checkin(2, monthsAgo(1), 150_000_00, 0),
    ]
    const { container } = render(<NetWorthHistoryChart checkins={checkins} accounts={accounts} />)
    expect(screen.getByRole('radio', { name: '5Y' })).toBeChecked()
    expect(container.querySelectorAll('circle')).toHaveLength(4)

    fireEvent.click(screen.getByRole('radio', { name: '1Y' }))
    expect(container.querySelectorAll('circle')).toHaveLength(2)
  })

  it('says so when a chosen window holds no check-in, instead of drawing a flat zero', () => {
    const checkins = [
      checkin(1, monthsAgo(30), 100_000_00, 0),
      checkin(2, monthsAgo(13), 150_000_00, 0),
    ]
    const { container } = render(<NetWorthHistoryChart checkins={checkins} accounts={accounts} />)
    fireEvent.click(screen.getByRole('radio', { name: '3M' }))

    expect(screen.getByText('No check-in in the last 3M. Widen the window to see them.')).toBeInTheDocument()
    expect(container.querySelector('svg')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'All' }))
    expect(container.querySelectorAll('circle')).toHaveLength(4)
  })
})
