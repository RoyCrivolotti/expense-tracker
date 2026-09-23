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
})
