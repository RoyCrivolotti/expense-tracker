import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { CompositionChart } from './CompositionChart'
import { FireChart } from './FireChart'
import { NetWorthChart } from './NetWorthChart'
import { RentVsOwnChart } from './RentVsOwnChart'
import { SavingsRateChart } from './SavingsRateChart'
import { defaultMilestones } from '../../../../engine'
import { makeScenario } from '../../../../testing/factories'

const scenario = makeScenario({ monthlyContributionCents: 50_000, annualSpendCents: 2_400_000, rentMonthlyCents: 100_000 })
const { id, isActive, ...draft } = scenario
void id
void isActive

/** The coloured dots in the tooltip of a chart, after a point is picked. */
function swatches(chart: ReactElement): number {
  const { container, unmount } = render(chart)
  fireEvent.keyDown(container.querySelector('svg[role="img"]')!, { key: 'Home' })
  const count = screen.getByRole('tooltip').querySelectorAll('[class*="tooltipSwatch"]').length
  unmount()
  return count
}

// The legend under each chart names its series by colour, so the tooltip rows that read those
// series carry the same dot; a row that is not a series (net worth, a total) has none.
describe('the colour of each series in its tooltip', () => {
  it('marks the three areas of the composition chart, and leaves the net worth total plain', () => {
    expect(swatches(<CompositionChart draft={draft} />)).toBe(3)
  })

  it('marks the FIRE portfolio, the rent and buy lines, and the savings series', () => {
    expect(swatches(<FireChart draft={draft} />)).toBe(1)
    expect(swatches(<RentVsOwnChart draft={draft} />)).toBe(2)
    const flow = { month: '2026-06', investedCents: 40_000, netSavingCents: 285_695 }
    expect(swatches(<SavingsRateChart draft={draft} monthly={[flow]} />)).toBe(3)
  })

  it('marks every scenario line of the main projection chart', () => {
    const chart = (
      <NetWorthChart milestones={defaultMilestones()} scenarios={[scenario]} draft={draft} activeId={scenario.id} />
    )
    // The one scenario, drawn as the draft.
    expect(swatches(chart)).toBe(1)
  })
})
