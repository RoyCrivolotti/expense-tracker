import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { ScenarioSeriesLegend, type ScenarioLegendBreakdown } from './ScenarioSeriesLegend'
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

  it('says what it is told before a year is pointed at, and its usual line otherwise', () => {
    const items = [{ label: 'Path A', color: '#6366f1', valueCents: null }]
    const { rerender } = render(
      <ScenarioSeriesLegend items={items} activeYear={null} breakdowns={[]} hint="Touch the chart." />,
    )
    expect(screen.getByText('Touch the chart.')).toBeInTheDocument()

    rerender(<ScenarioSeriesLegend items={items} activeYear={null} breakdowns={[]} />)
    expect(screen.getByText('Tap or hover the chart to compare values by year.')).toBeInTheDocument()
  })

  it('puts the purchase breakdown in a column of its own when asked, and no column when there is none', () => {
    const items = [{ label: 'Path A', color: '#6366f1', valueCents: 1_000_000 }]
    const { container, rerender } = render(
      <ScenarioSeriesLegend items={items} activeYear={5} breakdowns={[entry('1', 'Path A')]} extrasBeside />,
    )
    const extras = container.querySelector('[class*="besideExtras"]')!
    expect(extras).toHaveTextContent('Down payment + fees')
    expect(container.querySelector('[class*="besideMain"]')).toHaveTextContent('Year 5')
    expect(container.querySelector('[class*="besideMain"]')).not.toHaveTextContent('Down payment')

    rerender(<ScenarioSeriesLegend items={items} activeYear={6} breakdowns={[]} extrasBeside />)
    expect(container.querySelector('[class*="besideExtras"]')).toBeEmptyDOMElement()
  })

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

  it("says the purchase breakdown is in today's money when the values above it are nominal, and only then", () => {
    const props = {
      items: [{ label: 'Path A', color: '#6366f1', valueCents: 1_000_000 }],
      activeYear: 5,
      breakdowns: [entry('1', 'Path A')],
    }
    const { rerender } = render(<ScenarioSeriesLegend {...props} />)
    expect(screen.queryByText(/in today's money, not in the Nominal values/)).not.toBeInTheDocument()

    rerender(<ScenarioSeriesLegend {...props} breakdownInTodaysMoney />)
    expect(screen.getByText(/in today's money, not in the Nominal values/)).toBeInTheDocument()
  })

  it('hands out its list, and always shows the year header and the figures', () => {
    const listRef = createRef<HTMLUListElement>()
    const items = [{ label: 'Path A', color: '#6366f1', valueCents: 250_000_00 }]
    const props = { items, activeYear: 12, breakdowns: [], listRef }
    const { container } = render(<ScenarioSeriesLegend {...props} />)
    expect(listRef.current).toBe(container.querySelector('ul'))
    expect(screen.getByText('Year 12')).toBeInTheDocument()
    expect(screen.getByText('Path A')).toBeInTheDocument()
  })

  describe('where the purchase breakdown sits', () => {
    const base = {
      items: [{ label: 'Path A', color: '#6366f1', valueCents: 1_000_000 }],
      activeYear: 5,
      breakdowns: [entry('1', 'Path A')],
    }
    // The breakdown's own wrapper, and the thing that holds it.
    const holder = () => screen.getByText('Down payment + fees').closest('[class*="breakdownStack"]')?.parentElement

    it('floats over the wide chart, so showing it takes no room from the page', () => {
      render(<ScenarioSeriesLegend {...base} layout="chips" />)
      expect(holder()?.className).toMatch(/floater/)
    })

    it('floats on the side it is given, away from the year being pointed at', () => {
      const { rerender } = render(<ScenarioSeriesLegend {...base} layout="chips" />)
      expect(holder()?.className).toMatch(/floaterEnd/)
      rerender(<ScenarioSeriesLegend {...base} layout="chips" floatSide="start" />)
      expect(holder()?.className).toMatch(/floaterStart/)
    })

    it('stays in the flow on the phone, where it has the width of the card', () => {
      render(<ScenarioSeriesLegend {...base} layout="rows" />)
      expect(holder()?.className).not.toMatch(/floater/)
    })

    it('floats the year 0 note too, and only when there is something to show', () => {
      const { rerender } = render(<ScenarioSeriesLegend {...base} breakdowns={[]} layout="chips" />)
      expect(screen.queryByText(/House already owned/)).not.toBeInTheDocument()
      rerender(<ScenarioSeriesLegend {...base} breakdowns={[]} yearZeroHint layout="chips" />)
      expect(screen.getByText(/House already owned/).parentElement?.className).toMatch(/floater/)
    })
  })
})
