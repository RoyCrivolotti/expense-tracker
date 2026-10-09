import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MarketVolatilityContext } from '../../../hooks/marketVolatilityContext'
import type { makeScenario } from '../../../../testing/factories'
import { samplePlan } from '../../../../testing/samplePlan'
import { SpreadChart } from './SpreadChart'

function draftOf(over: Parameters<typeof makeScenario>[0] = {}) {
  const { id, isActive, ...draft } = samplePlan({ ...over })
  void id
  void isActive
  return draft
}
const milestones = [
  { amountCents: 10_000_000, label: '' },
  { amountCents: 100_000_000, label: '' },
]
const show = (over = {}, props: Partial<Parameters<typeof SpreadChart>[0]> = {}) =>
  render(<SpreadChart draft={draftOf(over)} milestones={milestones} runs={400} {...props} />)

describe('SpreadChart', () => {
  it('says where the middle run and the two tenths end against the plan\'s line, and what the euros are', () => {
    show()
    expect(screen.getByRole('heading', { name: 'How far luck could move the plan' })).toBeInTheDocument()
    expect(screen.getByText(/In year 30, in 2026 euros: the middle run ends at .*, the plan's line at .*, the luckiest tenth above .* and the unluckiest tenth below/)).toBeInTheDocument()
  })

  it('draws a chart with the plan and the replay, and names what each line is', () => {
    const { container } = show()
    expect(container.querySelector('svg[role="img"]')).not.toBeNull()
    expect(screen.getByText('The plan')).toBeInTheDocument()
    expect(screen.getByText(/Middle run, middle half shaded, 8 in 10 between the dashed lines/)).toBeInTheDocument()
  })

  it('says what the market is assumed to do, how many runs there are, and that only the market changes', () => {
    show()
    expect(screen.getByText(/Each of the 400 runs replays your plan in a different market/)).toBeInTheDocument()
    expect(screen.getByText(/the typical 5,0% a year times a luck factor with a bounce of 15,0%/)).toBeInTheDocument()
    expect(screen.getByText(/Only the market changes: the saving, the house, the events and the inflation are as planned/)).toBeInTheDocument()
  })

  it('uses the owner\'s market bounce, not a fixed one', () => {
    render(
      <MarketVolatilityContext.Provider value={0.11}>
        <SpreadChart draft={draftOf()} milestones={milestones} runs={400} />
      </MarketVolatilityContext.Provider>,
    )
    expect(screen.getByText(/a bounce of 11,0%/)).toBeInTheDocument()
  })

  it('lists when the runs first reach each milestone and the FI target, as years, with how many of 100 get there', () => {
    show()
    const table = screen.getByRole('table')
    expect(within(table).getByText('When the runs first reach each amount')).toBeInTheDocument()
    const rows = within(table).getAllByRole('row').slice(1)
    // Two milestones, then the FI target.
    expect(rows).toHaveLength(3)
    expect(within(rows[0]!).getByRole('rowheader')).toHaveTextContent('100.000')
    expect(within(rows[0]!).getByRole('rowheader')).toHaveTextContent('on your account')
    expect(within(rows[2]!).getByRole('rowheader')).toHaveTextContent(/FI target \(.* in 2026 euros\)/)
    expect(within(rows[2]!).getByRole('rowheader')).not.toHaveTextContent('on your account')
    for (const row of rows) expect(row).toHaveTextContent(/\d+ of 100 runs get there/)
    expect(rows[0]!).toHaveTextContent(/\d{4}/)
  })

  it('leaves the table out when there is nothing to reach', () => {
    show({ annualSpendCents: 0 }, { milestones: [] })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('says under the table that the milestones are on the account and the FI target is in the plan\'s euros', () => {
    show()
    expect(screen.getByText(/The chart is in 2026 euros\. In the table, milestone amounts are on your account and the FI target is in 2026 euros\./)).toBeInTheDocument()
  })

  it('names the chart\'s euros alone when there is no table', () => {
    show({ annualSpendCents: 0 }, { milestones: [] })
    expect(screen.getByText(/The chart is in 2026 euros\./)).toBeInTheDocument()
    expect(screen.queryByText(/In the table/)).not.toBeInTheDocument()
  })

  it('warns when a house takes more than the portfolio holds in more than one run in twenty, and not otherwise', () => {
    show()
    expect(screen.queryByText(/is below nothing from year/)).not.toBeInTheDocument()
    show({ startInvestedCents: 1_000_000, monthlyContributionCents: 0, housePurchaseYear: 3 })
    expect(screen.getByText(/of the runs the portfolio is below nothing from year 3/)).toBeInTheDocument()
  })

  it('draws the money of each year in the Nominal view, and says so', () => {
    show({}, { nominal: true })
    expect(screen.getByText(/In year 30, in euros on your account in each year/)).toBeInTheDocument()
    expect(screen.getAllByText(/euros on your account in each year/).length).toBeGreaterThan(0)
  })

  it('says what a year picked with the keys holds: both tenths, the middle run and the plan, each with its colour', () => {
    const { container } = show()
    const svg = container.querySelector('svg[role="img"]')!
    fireEvent.keyDown(svg, { key: 'Home' })
    fireEvent.keyDown(svg, { key: 'End' })
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent('Year 30 (2056)')
    for (const label of ['Luckiest tenth above', 'Middle run', 'The plan', 'Unluckiest tenth below']) expect(tip).toHaveTextContent(label)
    expect(tip.querySelectorAll('[class*="tooltipSwatch"]')).toHaveLength(4)
  })
})
