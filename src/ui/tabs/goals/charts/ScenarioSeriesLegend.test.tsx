import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
})
