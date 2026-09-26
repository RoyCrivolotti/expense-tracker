import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompositionChart } from './CompositionChart'
import { FireChart } from './FireChart'
import { NetWorthChart } from './NetWorthChart'
import { RentVsOwnChart } from './RentVsOwnChart'
import { SavingsRateChart } from './SavingsRateChart'
import { defaultMilestones, planFromToday } from '../../../../engine'
import { makeScenario } from '../../../../testing/factories'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const scenario = makeScenario({ monthlyContributionCents: 50_000, annualSpendCents: 2_400_000, rentMonthlyCents: 100_000 })
const { id, isActive, ...draft } = scenario
void id
void isActive

/** The coloured dots in the tooltip of a chart, after a point is picked. */
function swatches(chart: ReactElement, steps = 0): number {
  const { container, unmount } = render(chart)
  const svg = container.querySelector('svg[role="img"]')!
  fireEvent.keyDown(svg, { key: 'Home' })
  for (let i = 0; i < steps; i++) fireEvent.keyDown(svg, { key: 'ArrowRight' })
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

  it('marks the plan from today too, once the year is past the check-in', () => {
    // A phone with the legend below the fold, which is when the main chart has a tooltip.
    vi.stubGlobal('matchMedia', (media: string) => ({
      matches: true,
      media,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const legend = this.textContent?.includes('Tap or hover the chart') && !this.querySelector('svg')
      return (legend ? { top: window.innerHeight + 50, bottom: window.innerHeight + 300, height: 250 } : { top: 100, bottom: 330, height: 230 }) as DOMRect
    })
    const plan = makeScenario({ id: 1, name: 'Path A', planStartDate: '2024-01-01', isActive: true })
    const fromToday = planFromToday(plan, { investedCents: 160_000_00, date: '2026-07-01' })
    const chart = (
      <NetWorthChart
        milestones={defaultMilestones()}
        scenarios={[plan]}
        draft={draft}
        activeId={null}
        variant="hero"
        fromToday={fromToday}
      />
    )
    // Year 10 is well after the check-in: the plan, the draft and the plan from today.
    expect(swatches(chart, 10)).toBe(3)
  })
})
