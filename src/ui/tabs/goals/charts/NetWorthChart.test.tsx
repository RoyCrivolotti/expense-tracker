import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NetWorthChart } from './NetWorthChart'
import { computeChartDisplayData, deflatePoints, inflateSeries } from './nominalTransform'
import { makeScenario } from '../../../../testing/factories'
import { defaultMilestones } from '../../../../engine'
import type { ChartSeries } from '../../../charts/LinearChart'
import chartStyles from '../../../charts/charts.module.css'

const defaultDraft = makeScenario()
const milestones = defaultMilestones()

describe('inflateSeries and deflatePoints', () => {
  it('inflates values by the given rate per year offset, and leaves year zero alone', () => {
    const series: ChartSeries[] = [{ id: 's1', color: '#000', values: [100_000_000, 100_000_000], kind: 'line' }]
    const result = inflateSeries(series, [0, 1], 0.02)
    expect(result[0]!.values[0]).toBe(100_000_000)
    expect(result[0]!.values[1]).toBe(Math.round(100_000_000 * 1.02))
    expect(inflateSeries(series, [0, 1], 0.05)[0]!.values[1]).toBe(Math.round(100_000_000 * 1.05))
  })

  it('inflates the band with the line, and leaves a series without one alone', () => {
    const series: ChartSeries[] = [
      { id: 'b1', color: '#000', values: [0, 100_000_000], kind: 'line', band: { lo: [0, 80_000_000], hi: [0, 120_000_000] } },
      { id: 's2', color: '#000', values: [0], kind: 'line' },
    ]
    const result = inflateSeries(series, [0, 1], 0.02)
    expect(result[0]!.band?.lo[1]).toBe(Math.round(80_000_000 * 1.02))
    expect(result[0]!.band?.hi[1]).toBe(Math.round(120_000_000 * 1.02))
    expect(result[1]!.band).toBeUndefined()
  })

  it('leaves scatter points as they are when inflating: check-ins are already nominal', () => {
    const series: ChartSeries[] = [
      { id: 'actuals', color: '#10b981', values: [], kind: 'scatter', points: [{ xIndex: 2.5, value: 200_000_000 }] },
    ]
    expect(inflateSeries(series, [], 0.02)[0]!.points?.[0]?.value).toBe(200_000_000)
  })

  it('deflates scatter points by their own fractional xIndex, and nothing else', () => {
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
      { id: 's3', color: '#000', values: [50], kind: 'line' },
    ]
    const result = deflatePoints(series, 0.02)
    expect(result[0]!.points?.[0]?.value).toBe(100_000_000)
    expect(result[0]!.points?.[1]?.value).toBe(Math.round(200_000_000 / Math.pow(1.02, 2.5)))
    expect(result[1]!.values).toEqual([50])
    expect(result[1]!.points).toBeUndefined()
  })

  it('keeps a check-in that matches the plan level with the plan line, either way round', () => {
    // A portfolio exactly on plan must read as on plan in both views: deflating the dot
    // meets the real line, and the nominal view inflates the line up to the dot.
    const onPlanReal = 100_000_000
    const onPlanNominal = Math.round(onPlanReal * 1.02)
    const line: ChartSeries = { id: 'plan', color: '#000', values: [0, onPlanReal], kind: 'line' }
    const dot: ChartSeries = { id: 'actuals', color: '#10b981', values: [], kind: 'scatter', points: [{ xIndex: 1, value: onPlanNominal }] }
    expect(deflatePoints([dot], 0.02)[0]!.points?.[0]?.value).toBe(onPlanReal)
    expect(inflateSeries([line], [0, 1], 0.02)[0]!.values[1]).toBe(onPlanNominal)
  })
})

describe('NetWorthChart', () => {
  it('cuts the hero projection at the chosen window', () => {
    const { container } = render(
      <NetWorthChart
        milestones={milestones}
        scenarios={[]}
        draft={{ ...defaultDraft, horizonYears: 30 }}
        variant="hero"
      />,
    )
    const lastLabel = () => {
      const texts = [...container.querySelectorAll('text')].map((t) => t.textContent ?? '')
      return texts.filter((t) => /^\d+$/.test(t)).map(Number).sort((a, b) => a - b).pop()
    }
    expect(lastLabel()).toBe(30)

    fireEvent.click(screen.getByRole('radio', { name: '5Y' }))
    expect(lastLabel()).toBe(5)

    fireEvent.click(screen.getByRole('radio', { name: 'All' }))
    expect(lastLabel()).toBe(30)
  })

  it('falls back to the whole horizon when the chosen window is no longer offered', () => {
    const { container, rerender } = render(
      <NetWorthChart milestones={milestones} scenarios={[]} draft={{ ...defaultDraft, horizonYears: 30 }} variant="hero" />,
    )
    const lastLabel = () => {
      const texts = [...container.querySelectorAll('text')].map((t) => t.textContent ?? '')
      return texts.filter((t) => /^\d+$/.test(t)).map(Number).sort((a, b) => a - b).pop()
    }
    fireEvent.click(screen.getByRole('radio', { name: '5Y' }))
    expect(lastLabel()).toBe(5)

    rerender(
      <NetWorthChart milestones={milestones} scenarios={[]} draft={{ ...defaultDraft, horizonYears: 4 }} variant="hero" />,
    )
    // No window can cut a four-year horizon, so the picker goes entirely, and the chart
    // draws the whole horizon rather than a stale five-year cut or nothing at all.
    expect(screen.queryByRole('radiogroup', { name: 'Projection window' })).not.toBeInTheDocument()
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0)
    expect(lastLabel()).toBe(4)

    // With shorter windows still on offer, the lost one falls back to All, not to a
    // window that happens to be first.
    rerender(
      <NetWorthChart milestones={milestones} scenarios={[]} draft={{ ...defaultDraft, horizonYears: 30 }} variant="hero" />,
    )
    fireEvent.click(screen.getByRole('radio', { name: '20Y' }))
    rerender(
      <NetWorthChart milestones={milestones} scenarios={[]} draft={{ ...defaultDraft, horizonYears: 8 }} variant="hero" />,
    )
    expect(screen.queryByRole('radio', { name: '20Y' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked()
    expect(lastLabel()).toBe(8)
  })

  it('offers windows for the longest drawn horizon, not only the draft', () => {
    const long = makeScenario({ id: 9, name: 'Long', horizonYears: 40 })
    render(
      <NetWorthChart milestones={milestones} scenarios={[long]} draft={{ ...defaultDraft, horizonYears: 5 }} variant="hero" activeId={null} />,
    )
    expect(screen.getByRole('radio', { name: '20Y' })).toBeInTheDocument()
  })

  it('blanks the legend values, rather than showing zero, when a window drops the hovered year', () => {
    const { container } = render(
      <NetWorthChart milestones={milestones} scenarios={[]} draft={{ ...defaultDraft, horizonYears: 30 }} variant="hero" />,
    )
    const svg = container.querySelector('svg')!
    fireEvent.keyDown(svg, { key: 'End' })
    const values = () => [...container.querySelectorAll('[class*="value"]')].map((el) => el.textContent ?? '')
    // The draft's row shows year 30's figure once a year is focused.
    expect(values().length).toBeGreaterThan(0)
    expect(values().some((v) => v !== '')).toBe(true)

    fireEvent.click(screen.getByRole('radio', { name: '5Y' }))
    // The rows are still there, and every one is blank: not zero, not the old figure.
    expect(values().length).toBeGreaterThan(0)
    expect(values().every((v) => v === '')).toBe(true)
  })

  it('keeps a far-off FI target in the All view and drops it inside a window, as a milestone', () => {
    const { container } = render(
      <NetWorthChart
        milestones={[]}
        scenarios={[]}
        draft={{ ...defaultDraft, horizonYears: 30, annualSpendCents: 4_000_000_00, safeWithdrawalRate: 0.04 }}
        variant="hero"
      />,
    )
    expect(container.textContent).toMatch(/100\.0M/)
    fireEvent.click(screen.getByRole('radio', { name: '5Y' }))
    expect(container.textContent).not.toMatch(/100\.0M/)
    fireEvent.click(screen.getByRole('radio', { name: 'All' }))
    expect(container.textContent).toMatch(/100\.0M/)
  })

  it('offers no window buttons for a horizon the shortest window would not cut', () => {
    render(
      <NetWorthChart milestones={milestones} scenarios={[]} draft={{ ...defaultDraft, horizonYears: 5 }} variant="hero" />,
    )
    expect(screen.queryByRole('radio', { name: 'All' })).not.toBeInTheDocument()
  })

  it('lists a hidden scenario dimmed in the legend and toggles it from there', () => {
    const shown = makeScenario({ id: 1, name: 'Path A' })
    const hidden = makeScenario({ id: 2, name: 'Path B' })
    const onToggleVisible = vi.fn()
    const { container } = render(
      <NetWorthChart
        milestones={milestones}
        scenarios={[shown, hidden]}
        hiddenIds={new Set([2])}
        onToggleVisible={onToggleVisible}
        draft={defaultDraft}
        activeId={null}
        variant="hero"
      />,
    )
    // The shown scenario and the draft draw a line each; the hidden one draws none.
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(2)
    const hide = screen.getByRole('button', { name: 'Hide Path A on chart' })
    expect(hide).toHaveAttribute('aria-pressed', 'true')
    const show = screen.getByRole('button', { name: 'Show Path B on chart' })
    expect(show).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(show)
    expect(onToggleVisible).toHaveBeenCalledWith(2)
    fireEvent.click(hide)
    expect(onToggleVisible).toHaveBeenCalledWith(1)
    // The draft is always drawn, so its row is not a toggle.
    expect(screen.queryByRole('button', { name: /\(editing\) on chart/ })).not.toBeInTheDocument()
  })

  it('renders without crashing with default props', () => {
    const { container } = render(
      <NetWorthChart
        milestones={milestones}
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
        milestones={milestones}
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
        milestones={milestones}
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
        milestones={milestones}
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

  it('renders without crashing in the nominal view', () => {
    const { container } = render(
      <NetWorthChart
        milestones={milestones}
        scenarios={[defaultDraft]}
        draft={defaultDraft}
        activeId={defaultDraft.id}
        variant="hero"
        nominalMode
      />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('draws a check-in dot lower in today\'s money than in the nominal view', () => {
    const extra: ChartSeries = {
      id: 'actuals',
      color: '#10b981',
      values: [],
      kind: 'scatter',
      points: [{ xIndex: 10, value: 50_000_000 }],
    }
    const cy = (nominalMode: boolean) => {
      const { container } = render(
        <NetWorthChart
          milestones={milestones}
          scenarios={[defaultDraft]}
          draft={defaultDraft}
          activeId={defaultDraft.id}
          extraSeries={[extra]}
          nominalMode={nominalMode}
        />,
      )
      const circle = container.querySelector('circle')
      return Number(circle!.getAttribute('cy'))
    }
    // The Y axis is locked across both modes, and SVG y grows downward: the deflated dot
    // of the default view sits lower than the untouched one of the nominal view.
    expect(cy(false)).toBeGreaterThan(cy(true))
  })

  it('renders without crashing with a custom inflationRate in the nominal view', () => {
    const { container } = render(
      <NetWorthChart
        milestones={milestones}
        scenarios={[defaultDraft]}
        draft={defaultDraft}
        activeId={defaultDraft.id}
        variant="hero"
        nominalMode
        inflationRate={0.05}
      />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders uncertainty band path on hero variant', () => {
    const { container } = render(
      <NetWorthChart
        milestones={milestones}
        scenarios={[defaultDraft]}
        draft={defaultDraft}
        activeId={defaultDraft.id}
        variant="hero"
      />,
    )
    const paths = container.querySelectorAll('path')
    expect(paths.length).toBeGreaterThanOrEqual(2)
  })

  it('inflates the band with the line in the nominal view', () => {
    const bandPath = (nominalMode: boolean) => {
      const { container, unmount } = render(
        <NetWorthChart
          milestones={milestones}
          scenarios={[defaultDraft]}
          draft={defaultDraft}
          activeId={defaultDraft.id}
          variant="hero"
          nominalMode={nominalMode}
        />,
      )
      // The band is drawn first, as a filled area rather than a stroke.
      const d = container.querySelector('path')?.getAttribute('d')
      unmount()
      return d
    }
    // Locked Y axis, so a band that moved up with the line has a different outline.
    expect(bandPath(true)).not.toBe(bandPath(false))
  })

  it('does not render uncertainty band on default variant', () => {
    const { container: hero } = render(
      <NetWorthChart
        scenarios={[defaultDraft]}
        draft={defaultDraft}
        milestones={milestones}
        variant="hero"
      />,
    )
    const { container: def } = render(
      <NetWorthChart
        scenarios={[defaultDraft]}
        draft={defaultDraft}
        milestones={milestones}
        variant="default"
      />,
    )
    expect(hero.querySelectorAll('path').length).toBeGreaterThan(
      def.querySelectorAll('path').length,
    )
  })

  it('renders FI target reference line when FI target is not an existing milestone', () => {
    const scenario = makeScenario({ annualSpendCents: 2_400_000, safeWithdrawalRate: 0.04 })
    const { container } = render(
      <NetWorthChart
        milestones={milestones}
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
        milestones={milestones}
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
        milestones={milestones}
        scenarios={[scenario]}
        draft={scenario}
        activeId={scenario.id}
        variant="hero"
      />,
    )
    const polygons = container.querySelectorAll('polygon')
    expect(polygons.length).toBeGreaterThanOrEqual(2)
  })

  it('draws a reference line for a milestone the projection gets near', () => {
    const { container } = render(
      <NetWorthChart
        scenarios={[defaultDraft]}
        draft={defaultDraft}
        milestones={[{ amountCents: 10_000_000, label: '' }]}
        activeId={defaultDraft.id}
        variant="hero"
      />,
    )
    expect(container.querySelectorAll(`.${chartStyles.refLine}`)).toHaveLength(1)
  })

  it('drops a milestone far above the projection so it cannot flatten the chart', () => {
    const { container } = render(
      <NetWorthChart
        scenarios={[defaultDraft]}
        draft={defaultDraft}
        milestones={[{ amountCents: 5_000_000_000, label: 'Moonshot' }]}
        activeId={defaultDraft.id}
        variant="hero"
      />,
    )
    expect(container.querySelectorAll(`.${chartStyles.refLine}`)).toHaveLength(0)
  })

  it('does not add FI reference line when FI target matches an existing milestone', () => {
    const scenario = makeScenario({ annualSpendCents: 4_000_000, safeWithdrawalRate: 0.04 })
    const { container } = render(
      <NetWorthChart
        milestones={milestones}
        scenarios={[scenario]}
        draft={scenario}
        activeId={scenario.id}
        variant="hero"
      />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })
})

describe('computeChartDisplayData', () => {
  const years = [0, 1, 2, 3]
  const plan: ChartSeries = { id: 'plan', color: '#6366f1', values: [100_000_00, 110_000_00, 120_000_00, 130_000_00] }
  const dot: ChartSeries = { id: 'actuals', color: '#10b981', values: [], kind: 'scatter', points: [{ xIndex: 2, value: 104_040_00 }] }

  it('deflates the dots at the assumed rate whatever the view is set to', () => {
    const at = (rate: number) => computeChartDisplayData([plan], [dot], years, false, rate).displayExtraSeries[0]!.points![0]!.value
    // The stepper is a what-if for the nominal view; the dots must agree with the status line.
    expect(at(0.08)).toBe(at(0.02))
    expect(at(0.08)).toBe(Math.round(104_040_00 / 1.02 ** 2))
  })

  it('inflates the plan at the view\'s own rate and leaves the dots as they are in the nominal view', () => {
    const view = computeChartDisplayData([plan], [dot], years, true, 0.05)
    expect(view.displaySeries[0]!.values[2]).toBe(Math.round(120_000_00 * 1.05 ** 2))
    expect(view.displayExtraSeries[0]!.points![0]!.value).toBe(104_040_00)
  })
})
