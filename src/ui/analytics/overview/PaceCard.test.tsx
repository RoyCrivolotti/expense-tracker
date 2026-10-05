import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SpendingPace } from '../../../engine'
import { PaceCard } from './PaceCard'

function pace(partial: Partial<SpendingPace> = {}): SpendingPace {
  return {
    open: true,
    dayOfMonth: 10,
    daysInMonth: 31,
    flexibleSpentCents: 20000,
    fixedSpentCents: 100000,
    flexibleBudgetCents: 40000,
    shouldBeTodayCents: 13000,
    projectedCents: 62000,
    lastMonthSameDayCents: 18000,
    ...partial,
  }
}

describe('PaceCard', () => {
  it('tells a closed month from one that has not started', () => {
    const { rerender } = render(<PaceCard pace={pace({ open: false })} isFuture={false} />)
    expect(screen.getByText(/Closed month/)).toBeInTheDocument()
    rerender(<PaceCard pace={pace({ open: false })} isFuture />)
    expect(screen.getByText(/Not started/)).toBeInTheDocument()
  })

  it('keeps the meter inside its track when refunds push the spend below zero', () => {
    const { container } = render(
      <PaceCard pace={pace({ flexibleSpentCents: -5000, lastMonthSameDayCents: -2000 })} isFuture={false} />,
    )
    const widths = [...container.querySelectorAll<HTMLElement>('[style]')].map((el) => el.style.width + el.style.left)
    for (const w of widths) expect(w).not.toContain('-')
  })
})
