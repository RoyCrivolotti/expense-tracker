import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CompositionChart } from './CompositionChart'
import { makeScenario } from '../../../../testing/factories'

const scenario = makeScenario({ monthlyContributionCents: 50_000, annualSpendCents: 2_400_000, rentMonthlyCents: 100_000 })
const { id, isActive, ...draft } = scenario
void id
void isActive

/** The legend's own value cells, scoped to its <ul> so a tooltip value never leaks in. */
function legendValues(container: HTMLElement): string[] {
  return [...container.querySelectorAll('ul li span:last-child')].map((el) => el.textContent ?? '')
}

describe('CompositionChart legend', () => {
  it('shows blank values until a point is focused', () => {
    const { container } = render(<CompositionChart draft={draft} />)
    expect(screen.getByText('Invested portfolio')).toBeInTheDocument()
    expect(legendValues(container)).toEqual(['', '', ''])
  })

  it('fills in live values for the focused point, alongside the tooltip, and clears on Escape', () => {
    const { container } = render(<CompositionChart draft={draft} />)
    const svg = container.querySelector('svg[role="img"]')!

    fireEvent.keyDown(svg, { key: 'Home' })
    // The tooltip still shows too: the legend is an addition, not a replacement.
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    expect(legendValues(container).every((v) => v.length > 0)).toBe(true)

    fireEvent.keyDown(svg, { key: 'Escape' })
    expect(legendValues(container)).toEqual(['', '', ''])
  })
})

describe('CompositionChart names', () => {
  it('calls the house series its value, not its equity, which is the value less the mortgage', () => {
    render(<CompositionChart draft={draft} />)

    expect(screen.getByText('House value')).toBeInTheDocument()
    expect(screen.getByText(/Invested portfolio \+ house value − mortgage owed/)).toBeInTheDocument()
    expect(screen.queryByText(/equity/i)).not.toBeInTheDocument()
  })

  it('uses the legend names in the tooltip', () => {
    const { container } = render(<CompositionChart draft={draft} />)

    fireEvent.keyDown(container.querySelector('svg[role="img"]')!, { key: 'Home' })

    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('Invested portfolio')
    expect(tooltip).toHaveTextContent('House value')
    expect(tooltip).toHaveTextContent('Mortgage owed')
  })
})
