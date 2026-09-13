import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import { BudgetBar } from './BudgetBar'
import type { BudgetStatus } from '../../engine/categoryBudget'

function renderBar(props: {
  actualCents: number
  budgetCents: number
  ratio: number
  status: BudgetStatus
}) {
  return render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
      <BudgetBar name="Travel" {...props} />
    </MoneyFormatProvider>,
  )
}

/** The fill is presentational — no role — so read it off the inline width. */
function fillWidth(container: HTMLElement): string {
  const fill = container.querySelector<HTMLElement>('[style*="width"]')
  return fill?.style.width ?? ''
}

describe('BudgetBar', () => {
  it('labels a net-negative category as money back rather than a percentage', () => {
    renderBar({ actualCents: -45000, budgetCents: 100000, ratio: -0.45, status: 'credit' })
    expect(screen.getByText('Money back')).toBeInTheDocument()
    // The old rendering. Asserting its absence is the point of the fix: a
    // negative percentage in a green pill read as "45% under budget".
    expect(screen.queryByText('-45%')).not.toBeInTheDocument()
  })

  it('empties the track for a credit instead of drawing the 2% stub', () => {
    // Math.max(2, Math.round(-0.45 * 100)) is 2, so the old code painted a
    // sliver of colour for a category that spent nothing on balance.
    const { container } = renderBar({
      actualCents: -45000,
      budgetCents: 100000,
      ratio: -0.45,
      status: 'credit',
    })
    expect(fillWidth(container)).toBe('0%')
  })

  it('prints the actual with a minus when the category is in credit', () => {
    // Money renders |cents| unless given a sign, so -45000 used to print as
    // "450,00 €" — visually identical to being 350% over budget.
    renderBar({ actualCents: -45000, budgetCents: 100000, ratio: -0.45, status: 'credit' })
    expect(screen.getByText(/−450,00/)).toBeInTheDocument()
  })

  it('does not decorate ordinary spending with a plus', () => {
    renderBar({ actualCents: 45000, budgetCents: 100000, ratio: 0.45, status: 'under' })
    expect(screen.queryByText(/\+450,00/)).not.toBeInTheDocument()
    expect(screen.getByText(/^450,00/)).toBeInTheDocument()
  })

  it('still shows a percentage for the spending states', () => {
    renderBar({ actualCents: 110000, budgetCents: 100000, ratio: 1.1, status: 'over' })
    expect(screen.getByText('110%')).toBeInTheDocument()
  })

  it('keeps the minimum-width stub for a small but real spend', () => {
    const { container } = renderBar({
      actualCents: 1000,
      budgetCents: 100000,
      ratio: 0.01,
      status: 'under',
    })
    expect(fillWidth(container)).toBe('2%')
  })

  it('shows no pill at all when no budget is set', () => {
    renderBar({ actualCents: -45000, budgetCents: 0, ratio: 0, status: 'under' })
    expect(screen.queryByText('Money back')).not.toBeInTheDocument()
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
  })
})
