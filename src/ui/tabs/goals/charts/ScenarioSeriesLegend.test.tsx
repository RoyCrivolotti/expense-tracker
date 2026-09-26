import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { ScenarioSeriesLegend, type ScenarioLegendBreakdown } from './ScenarioSeriesLegend'
import styles from './ScenarioSeriesLegend.module.css'
import type { PurchaseYearBreakdown } from '../../../../engine'

const breakdown: PurchaseYearBreakdown = {
  year: 5,
  startInvestedCents: 10_000_000,
  growthCents: 700_000,
  contributionCents: 1_200_000,
  beforePurchaseCents: 11_900_000,
  downPaymentCents: 8_000_000,
  transactionCostsCents: 0,
  totalWithdrawalCents: 8_000_000,
  endInvestedCents: 3_900_000,
  netChangeCents: -6_100_000,
}

function entry(id: string, label: string): ScenarioLegendBreakdown {
  return { id, label, color: '#6366f1', breakdown }
}

describe('ScenarioSeriesLegend', () => {
  afterEach(() => vi.restoreAllMocks())

  it('keeps two same-named scenarios apart in the purchase breakdown', () => {
    // Scenario names are not unique (Duplicate makes "<name> (copy)", and a name can be
    // reused), so keying the breakdown by name made React warn and merge the two.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ScenarioSeriesLegend
        items={[{ label: 'Path A', color: '#6366f1', valueCents: 1_000_000 }]}
        activeYear={5}
        breakdowns={[entry('1', 'Path A'), entry('2', 'Path A')]}
      />,
    )

    expect(screen.getAllByText('Path A', { selector: 'p' })).toHaveLength(2)
    expect(error).not.toHaveBeenCalled()
  })

  it('unsees the year header and the figures without taking their space, and hands out its list', () => {
    const listRef = createRef<HTMLUListElement>()
    const items = [{ label: 'Path A', color: '#6366f1', valueCents: 250_000_00 }]
    const props = { items, activeYear: 12, breakdowns: [], listRef }
    const { container, rerender } = render(<ScenarioSeriesLegend {...props} />)
    const wrap = container.firstElementChild!
    expect(wrap).not.toHaveClass(styles.valuesHidden!)
    expect(listRef.current).toBe(container.querySelector('ul'))
    rerender(<ScenarioSeriesLegend {...props} valuesHidden />)
    // Hidden by class, not removed: the row's height and the list's place on screen must not move.
    expect(container.firstElementChild).toHaveClass(styles.valuesHidden!)
    expect(screen.getByText('Year 12')).toBeInTheDocument()
    expect(screen.getByText('Path A')).toBeInTheDocument()
  })
})
