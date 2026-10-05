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
})
