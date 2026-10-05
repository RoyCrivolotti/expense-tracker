import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeCashRow } from '../../../testing/cashRow'
import { MonthCloseDots } from './MonthCloseDots'

const rows = [
  makeCashRow({ month: '2026-01', actualCashCents: 100, monthGapCents: 0 }),
  makeCashRow({ month: '2026-02', actualCashCents: 100, monthGapCents: 9_000 }),
  makeCashRow({ month: '2026-03' }),
  makeCashRow({ month: '2026-04', unpaidLiabilityCents: 4_000 }),
]

describe('MonthCloseDots', () => {
  it('gives each month the glyph and title of its close status', () => {
    render(<MonthCloseDots rows={rows} selected="2026-03" onSelect={() => {}} />)

    expect(screen.getByTitle('Jan: counted')).toHaveTextContent('✓')
    expect(screen.getByTitle('Feb: drift found')).toHaveTextContent('!')
    expect(screen.getByTitle('Mar: ready to count')).toHaveTextContent('●')
    expect(screen.getByTitle('Apr: waiting on a card statement')).toHaveTextContent('…')
    expect(screen.getByTitle('Mar: ready to count')).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows a month that has not ended as such, not as ready to count', () => {
    render(<MonthCloseDots rows={rows} selected="2026-01" openMonth="2026-03" onSelect={() => {}} />)
    expect(screen.getByTitle('Mar: not ended yet')).toHaveTextContent('◔')
    expect(screen.getByTitle('Apr: not ended yet')).toHaveTextContent('◔')
  })

  it('selects the month of the dot that was tapped', () => {
    const onSelect = vi.fn()
    render(<MonthCloseDots rows={rows} selected="2026-03" onSelect={onSelect} />)
    fireEvent.click(screen.getByTitle('Feb: drift found'))
    expect(onSelect).toHaveBeenCalledWith('2026-02')
  })
})
