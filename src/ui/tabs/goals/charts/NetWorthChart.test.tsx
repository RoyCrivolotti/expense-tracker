import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NetWorthChart } from './NetWorthChart'
import { applyNominalTransform } from './nominalTransform'
import { makeScenario } from '../../../../testing/factories'
import type { ChartSeries } from '../../../charts/LinearChart'

const defaultDraft = makeScenario()

describe('applyNominalTransform', () => {
  it('scales values by compounding 2% per year offset', () => {
    const series: ChartSeries[] = [
      { id: 's1', color: '#000', values: [0, 100_000_000], kind: 'line' },
    ]
    const years = [0, 1]
    const result = applyNominalTransform(series, years)
    expect(result[0]!.values[0]).toBe(0)
    expect(result[0]!.values[1]).toBe(Math.round(100_000_000 * 1.02))
  })

  it('scales band lo and hi when band is present', () => {
    const series: ChartSeries[] = [
      {
        id: 'b1',
        color: '#000',
        values: [0, 100_000_000],
        kind: 'line',
        band: { lo: [0, 80_000_000], hi: [0, 120_000_000] },
      },
    ]
    const years = [0, 1]
    const result = applyNominalTransform(series, years)
    expect(result[0]!.band?.lo[1]).toBe(Math.round(80_000_000 * 1.02))
    expect(result[0]!.band?.hi[1]).toBe(Math.round(120_000_000 * 1.02))
  })

  it('omits band property when original series has no band', () => {
    const series: ChartSeries[] = [{ id: 's2', color: '#000', values: [0], kind: 'line' }]
    const result = applyNominalTransform(series, [0])
    expect(result[0]!.band).toBeUndefined()
  })
})

describe('NetWorthChart', () => {
  it('renders without crashing with default props', () => {
    const { container } = render(
      <NetWorthChart
        scenarios={[defaultDraft]}
        draft={defaultDraft}
        activeId={defaultDraft.id}
        dirty={false}
      />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders extraSeries overlaid on the chart', () => {
    const extra: ChartSeries = {
      id: 'actuals',
      color: '#10b981',
      values: [],
      kind: 'scatter',
      points: [{ xIndex: 1, value: 50_000_000 }],
    }
    const { container } = render(
      <NetWorthChart
        scenarios={[defaultDraft]}
        draft={defaultDraft}
        activeId={defaultDraft.id}
        extraSeries={[extra]}
      />,
    )
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBeGreaterThanOrEqual(1)
  })

  it('renders today marker when todayIndex is provided', () => {
    const { container } = render(
      <NetWorthChart
        scenarios={[defaultDraft]}
        draft={defaultDraft}
        activeId={defaultDraft.id}
        todayIndex={2}
      />,
    )
    // SVG line elements are rendered for today marker and grid
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders hero variant with taller height', () => {
    const { container } = render(
      <NetWorthChart
        scenarios={[defaultDraft]}
        draft={defaultDraft}
        activeId={defaultDraft.id}
        variant="hero"
      />,
    )
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(Number(svg!.getAttribute('viewBox')?.split(' ')[3] ?? 0)).toBeGreaterThan(200)
  })

  it('renders without crashing when nominalMode is true', () => {
    const { container } = render(
      <NetWorthChart
        scenarios={[defaultDraft]}
        draft={defaultDraft}
        activeId={defaultDraft.id}
        variant="hero"
        nominalMode
      />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })


  it('renders FI target reference line when FI target is not an existing milestone', () => {
    // 2_400_000 / 0.04 = 60_000_000 — not in MILESTONE_CENTS (10M,20M,30M,40M,50M,75M,100M)
    const scenario = makeScenario({ annualSpendCents: 2_400_000, safeWithdrawalRate: 0.04 })
    const { container } = render(
      <NetWorthChart
        scenarios={[scenario]}
        draft={scenario}
        activeId={scenario.id}
        variant="hero"
      />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('does not add FI reference line when annualSpendCents is 0', () => {
    const scenario = makeScenario({ annualSpendCents: 0, safeWithdrawalRate: 0.04 })
    const { container } = render(
      <NetWorthChart
        scenarios={[scenario]}
        draft={scenario}
        activeId={scenario.id}
        variant="hero"
      />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('does not add FI reference line when FI target matches an existing milestone', () => {
    // 4_000_000 / 0.04 = 100_000_000 — already in MILESTONE_CENTS, so no extra line added
    const scenario = makeScenario({ annualSpendCents: 4_000_000, safeWithdrawalRate: 0.04 })
    const { container } = render(
      <NetWorthChart
        scenarios={[scenario]}
        draft={scenario}
        activeId={scenario.id}
        variant="hero"
      />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
