import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { OverviewKpis, OverviewTotals } from '../../../engine'
import { KpiTiles } from './KpiTiles'

function totals(partial: Partial<OverviewTotals> = {}): OverviewTotals {
  return { incomeCents: 0, spendCents: 12000, savedCents: -12000, investedCents: 0, rate: null, ...partial }
}

describe('KpiTiles', () => {
  it('shows a dash and no fabricated comparison when the rate does not exist', () => {
    // No income: the savings rate is not 0%, it is not a number at all.
    const kpis: OverviewKpis = {
      current: totals(),
      baseline: totals({ incomeCents: 300000, savedCents: 288000, rate: 0.96 }),
      openDayLimit: null,
      series: [
        { month: '2026-02', totals: totals({ incomeCents: 300000, rate: 0.96 }) },
        { month: '2026-03', totals: totals() },
      ],
    }
    render(<KpiTiles kpis={kpis} baselineName="last month" />)
    expect(screen.getByText('—')).toBeInTheDocument()
    // The rate tile must not chip "▼ 96 pts" against an invented 0.
    expect(screen.getAllByText('no comparison').length).toBeGreaterThan(0)
    expect(screen.queryByText(/pts/)).toBeNull()
  })

  it('names the baseline amount beside each chip, so a percentage can be checked', () => {
    const kpis: OverviewKpis = {
      current: totals({ incomeCents: 320000, spendCents: 130000, savedCents: 190000, rate: 0.59 }),
      baseline: totals({ incomeCents: 300000, spendCents: 100000, savedCents: 200000, rate: 0.67 }),
      openDayLimit: null,
      series: [],
    }
    render(<KpiTiles kpis={kpis} baselineName="3-month average" />)
    expect(screen.getByText('vs 3.000 € 3-month average')).toBeInTheDocument()
    expect(screen.getByText('vs 1.000 € 3-month average')).toBeInTheDocument()
    expect(screen.getByText(/^vs 67.*3-month average$/)).toBeInTheDocument()
  })

  it('shows no baseline line when history does not reach', () => {
    const kpis: OverviewKpis = { current: totals(), baseline: null, openDayLimit: null, series: [] }
    render(<KpiTiles kpis={kpis} baselineName="last year" />)
    expect(screen.queryByText(/^vs /)).toBeNull()
  })
})
