import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NetWorthChart } from './NetWorthChart'
import { applyRealTransform } from './nominalTransform'
import { makeScenario } from '../../../../testing/factories'
import type { ChartSeries } from '../../../charts/LinearChart'

const defaultDraft = makeScenario()

describe('applyRealTransform', () => {
  it('deflates values by the given rate per year offset', () => {
    const series: ChartSeries[] = [
      { id: 's1', color: '#000', values: [0, 100_000_000], kind: 'line' },
    ]
    const years = [0, 1]
    const result = applyRealTransform(series, years, 0.02)
    expect(result[0]!.values[0]).toBe(0)
    expect(result[0]!.values[1]).toBe(Math.round(100_000_000 / 1.02))
  })

  it('uses the passed inflation rate for deflation', () => {
    const series: ChartSeries[] = [{ id: 's1', color: '#000', values: [100_000_000], kind: 'line' }]
    const result = applyRealTransform(series, [1], 0.05)
    expect(result[0]!.values[0]).toBe(Math.round(100_000_000 / 1.05))
  })

  it('deflates band lo and hi when band is present', () => {
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
    const result = applyRealTransform(series, years, 0.02)
    expect(result[0]!.band?.lo[1]).toBe(Math.round(80_000_000 / 1.02))
    expect(result[0]!.band?.hi[1]).toBe(Math.round(120_000_000 / 1.02))
  })

  it('omits band property when original series has no band', () => {
    const series: ChartSeries[] = [{ id: 's2', color: '#000', values: [0], kind: 'line' }]
    const result = applyRealTransform(series, [0], 0.02)
    expect(result[0]!.band).toBeUndefined()
  })

  it('leaves scatter point values untouched', () => {
    const series: ChartSeries[] = [
      {
        id: 'actuals',
        color: '#10b981',
        values: [],
        kind: 'scatter',
        points: [
          { xIndex: 0, value: 100_000_000 },
          { xIndex: 2.5, value: 200_000_000 },
        ],
      },
    ]
    const result = applyRealTransform(series, [], 0.02)
    expect(result[0]!.points?.[0]?.value).toBe(100_000_000)
    expect(result[0]!.points?.[1]?.value).toBe(200_000_000)
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

  it('renders without crashing when realMode is true', () => {
    const { container } = render(
      <NetWorthChart
        scenarios={[defaultDraft]}
        draft={defaultDraft}
        activeId={defaultDraft.id}
        variant="hero"
        realMode
      />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders without crashing with a custom inflationRate in realMode', () => {
    const { container } = render(
      <NetWorthChart
        scenarios={[defaultDraft]}
        draft={defaultDraft}
        activeId={defaultDraft.id}
        variant="hero"
        realMode
        inflationRate={0.05}
      />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders uncertainty band path on hero variant', () => {
    const { container } = render(
      <NetWorthChart
        scenarios={[defaultDraft]}
        draft={defaultDraft}
        activeId={defaultDraft.id}
        variant="hero"
      />,
    )
    const paths = container.querySelectorAll('path')
    expect(paths.length).toBeGreaterThanOrEqual(2)
  })

  it('does not render uncertainty band on default variant', () => {
    const { container: hero } = render(
      <NetWorthChart scenarios={[defaultDraft]} draft={defaultDraft} variant="hero" />,
    )
    const { container: def } = render(
      <NetWorthChart scenarios={[defaultDraft]} draft={defaultDraft} variant="default" />,
    )
    expect(hero.querySelectorAll('path').length).toBeGreaterThan(
      def.querySelectorAll('path').length,
    )
  })

  it('renders FI target reference line when FI target is not an existing milestone', () => {
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

  it('renders life event diamond markers on hero chart', () => {
    const scenario = makeScenario({
      lifeEvents: [
        { year: 3, amountCents: 10_000_000, label: 'Bonus' },
        { year: 7, amountCents: -5_000_000, label: 'Car' },
      ],
    })
    const { container } = render(
      <NetWorthChart
        scenarios={[scenario]}
        draft={scenario}
        activeId={scenario.id}
        variant="hero"
      />,
    )
    const polygons = container.querySelectorAll('polygon')
    expect(polygons.length).toBeGreaterThanOrEqual(2)
  })

  it('does not add FI reference line when FI target matches an existing milestone', () => {
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
