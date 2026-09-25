import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NetWorthChart } from './NetWorthChart'
import { AssumedInflationContext } from '../../../hooks/assumedInflationContext'
import { computeChartDisplayData, deflatePoints, inflatePoints, inflateSeries } from './nominalTransform'
import { pointSeriesValueAt } from './checkinChartUtils'
import { planFromToday } from '../../../../engine'
import { makeScenario } from '../../../../testing/factories'
import { defaultMilestones } from '../../../../engine'
import type { ChartSeries } from '../../../charts/LinearChart'
import chartStyles from '../../../charts/charts.module.css'

// A test that stubs the media query or a measurement must not leave it behind, even when it fails.
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

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

  it('keeps a hidden scenario in its place in the legend', () => {
    const a = makeScenario({ id: 1, name: 'Path A' })
    const b = makeScenario({ id: 2, name: 'Path B' })
    const c = makeScenario({ id: 3, name: 'Path C' })
    render(
      <NetWorthChart
        milestones={milestones}
        scenarios={[a, b, c]}
        hiddenIds={new Set([1])}
        onToggleVisible={vi.fn()}
        draft={defaultDraft}
        activeId={null}
        variant="hero"
      />,
    )
    const rows = screen.getAllByRole('button', { name: /on chart$/ }).map((el) => el.getAttribute('aria-label'))
    // Hidden or not, A stays first; hiding it must not shuffle B and C up a row.
    expect(rows).toEqual(['Show Path A on chart', 'Hide Path B on chart', 'Hide Path C on chart'])
  })

  it('draws the plan from today as a dotted line in the plan\'s colour, with a legend row', () => {
    const plan = makeScenario({ id: 1, name: 'Path A', color: '#123456', planStartDate: '2024-01-01', isActive: true })
    const fromToday = planFromToday(plan, { investedCents: 160_000_00, date: '2026-01-01' })
    const { container } = render(
      <NetWorthChart
        milestones={milestones}
        scenarios={[plan]}
        draft={defaultDraft}
        activeId={null}
        variant="hero"
        fromToday={fromToday}
      />,
    )
    const dotted = [...container.querySelectorAll('path')].filter((p) => p.getAttribute('stroke-dasharray') === '2 4')
    expect(dotted).toHaveLength(1)
    expect(dotted[0]!.getAttribute('style')).toContain('rgb(18, 52, 86)')
    // A line, not readings: no markers along it.
    expect(container.querySelector('svg[role="img"]')!.querySelectorAll('circle')).toHaveLength(0)
    expect(screen.getByText('Path A, from today')).toBeInTheDocument()
    // Not a scenario of its own, so nothing to hide.
    expect(screen.queryByRole('button', { name: /from today on chart/ })).not.toBeInTheDocument()
  })

  it('reads the from-today line off its segment for the legend and the tooltip', () => {
    const points = [
      { xIndex: 2.5, value: 100 },
      { xIndex: 3.5, value: 200 },
    ]
    expect(pointSeriesValueAt(points, 3)).toBe(150)
    expect(pointSeriesValueAt(points, 2.5)).toBe(100)
    // Before the check-in the plan from today does not exist yet.
    expect(pointSeriesValueAt(points, 1)).toBeNull()
    expect(pointSeriesValueAt([], 1)).toBeNull()
  })

  it('inflates a real point series by each point\'s own year in the nominal view', () => {
    const series: ChartSeries[] = [
      { id: 'from-today', color: '#000', values: [], kind: 'scatter', points: [{ xIndex: 2, value: 100_000_000 }] },
    ]
    expect(inflatePoints(series, 0.02)[0]!.points?.[0]?.value).toBe(Math.round(100_000_000 * 1.02 ** 2))
    const shown = computeChartDisplayData([], [], [0, 1, 2], true, 0.02, null, null, series)
    expect(shown.displayRealPoints[0]!.points?.[0]?.value).toBe(Math.round(100_000_000 * 1.02 ** 2))
    const real = computeChartDisplayData([], [], [0, 1, 2], false, 0.02, null, null, series)
    expect(real.displayRealPoints[0]!.points?.[0]?.value).toBe(100_000_000)
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

  it('gives the hero chart a tooltip where the page is one column, unless its legend is fully on screen', () => {
    const media = (matches: boolean) =>
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    const heroProps = { milestones, scenarios: [defaultDraft], draft: defaultDraft, activeId: defaultDraft.id, variant: 'hero' as const }
    media(true)
    const { container, unmount } = render(<NetWorthChart {...heroProps} />)
    const svg = container.querySelector('svg[role="img"]')!
    const legend = screen.getByText(/Tap or hover the chart/).closest('div')!.parentElement!
    const legendAt = (top: number, bottom: number) =>
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        if (this.style.visibility === 'hidden') return { top: 0, bottom: 0, height: 0 } as DOMRect
        return this === legend
          ? ({ top, bottom, height: bottom - top } as DOMRect)
          : ({ top: 100, bottom: 330, height: 230 } as DOMRect)
      })
    // Its legend, which repeats the values, is fully on screen: the tooltip would cover it.
    legendAt(340, 600)
    fireEvent.keyDown(svg, { key: 'Home' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.keyDown(svg, { key: 'Escape' })
    // Below the fold: the tooltip is what shows the year.
    legendAt(window.innerHeight + 20, window.innerHeight + 400)
    fireEvent.keyDown(svg, { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Year 0')
    unmount()
    // On a wide screen the legend under the chart is the readout, and nothing floats.
    media(false)
    const wide = render(<NetWorthChart {...heroProps} />)
    fireEvent.keyDown(wide.container.querySelector('svg[role="img"]')!, { key: 'Home' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
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

  it('draws the nominal view at the owner\'s assumed inflation', () => {
    // The chart has no rate of its own: the same plan is drawn higher at a higher inflation.
    const top = (rate: number) => {
      const { container, unmount } = render(
        <AssumedInflationContext.Provider value={rate}>
          <NetWorthChart
            milestones={milestones}
            scenarios={[defaultDraft]}
            draft={defaultDraft}
            activeId={defaultDraft.id}
            variant="hero"
            nominalMode
          />
        </AssumedInflationContext.Provider>,
      )
      const labels = [...container.querySelectorAll('text')].map((t) => t.textContent ?? '')
      unmount()
      return labels.join('|')
    }
    expect(top(0.06)).not.toBe(top(0.02))
  })

  it('previews the nominal view at another rate, and only there', () => {
    const drawing = (nominalMode: boolean, viewInflation?: number) => {
      const { container, unmount } = render(
        <NetWorthChart
          milestones={milestones}
          scenarios={[defaultDraft]}
          draft={defaultDraft}
          activeId={defaultDraft.id}
          variant="hero"
          nominalMode={nominalMode}
          viewInflation={viewInflation}
        />,
      )
      const text = [...container.querySelectorAll('text')].map((t) => t.textContent ?? '').join('|')
      const paths = [...container.querySelectorAll('path')].map((p) => p.getAttribute('d') ?? '').join('|')
      unmount()
      return { text, paths }
    }
    // The saved rate is 2%. A previewed 6% draws the plan higher, and the chart grows its axis to fit it.
    expect(drawing(true, 0.06).paths).not.toBe(drawing(true).paths)
    expect(drawing(true, 0.06).text).not.toBe(drawing(true).text)
    // A lower preview draws the plan lower against the same axis, so the labels do not move.
    expect(drawing(true, 0.0).paths).not.toBe(drawing(true).paths)
    expect(drawing(true, 0.0).text).toBe(drawing(true).text)
    // In Today's money the plan is not inflated, so a rate left over from a preview does nothing.
    expect(drawing(false, 0.06)).toEqual(drawing(false))
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

  it('draws no target lines in the nominal view, where a flat line would be crossed early', () => {
    const render1 = (nominalMode: boolean) =>
      render(
        <NetWorthChart
          scenarios={[defaultDraft]}
          draft={defaultDraft}
          milestones={[{ amountCents: 10_000_000, label: '' }]}
          activeId={defaultDraft.id}
          variant="hero"
          nominalMode={nominalMode}
        />,
      ).container
    expect(render1(false).querySelectorAll(`.${chartStyles.refLine}`)).toHaveLength(1)
    // Targets are in today's money and the nominal view inflates the plan past them.
    expect(render1(true).querySelectorAll(`.${chartStyles.refLine}`)).toHaveLength(0)
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

  it('deflates the dots and inflates the plan by the one rate it is given', () => {
    const rate = 0.05
    // Today's money: the dots come back by the rate, the plan is left as it is.
    const real = computeChartDisplayData([plan], [dot], years, false, rate)
    expect(real.displayExtraSeries[0]!.points![0]!.value).toBe(Math.round(104_040_00 / 1.05 ** 2))
    expect(real.displaySeries[0]!.values).toEqual(plan.values)
    // Nominal: the plan goes up by the same rate and the dots, already nominal, stay.
    const nominal = computeChartDisplayData([plan], [dot], years, true, rate)
    expect(nominal.displaySeries[0]!.values[2]).toBe(Math.round(120_000_00 * 1.05 ** 2))
    expect(nominal.displayExtraSeries[0]!.points![0]!.value).toBe(104_040_00)
  })

  it('draws a previewed rate but keeps the axis floor at the saved rate\'s, and the dots as they are', () => {
    const saved = computeChartDisplayData([plan], [dot], years, true, 0.02)
    const preview = computeChartDisplayData([plan], [dot], years, true, 0.02, null, 0.06)

    expect(preview.displaySeries[0]!.values[3]).toBe(Math.round(130_000_00 * 1.06 ** 3))
    expect(preview.displaySeries[0]!.values).not.toEqual(saved.displaySeries[0]!.values)
    // The scale holds still whatever is previewed; the chart grows it only if a line no longer fits.
    expect(preview.yDomainMax).toBe(saved.yDomainMax)
    expect(preview.displayExtraSeries[0]!.points![0]!.value).toBe(104_040_00)
    // A preview rate equal to the saved one is not a change.
    expect(computeChartDisplayData([plan], [dot], years, true, 0.02, null, 0.02)).toEqual(saved)
  })

  it('has no rate of its own to fall back on', () => {
    // A different rate moves both, so nothing in the chart is fixed at 2%.
    const at = (rate: number) => computeChartDisplayData([plan], [dot], years, false, rate).displayExtraSeries[0]!.points![0]!.value
    expect(at(0.08)).toBeLessThan(at(0.02))
  })
})
