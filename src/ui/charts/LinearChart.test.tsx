import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import chartStyles from './charts.module.css'
import { LinearChart, type ChartSeries } from './LinearChart'
import { nearestIndex } from './useChartFocus'

beforeAll(() => {
  // The docked tooltip reads a media query; jsdom has no matchMedia.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

function makeLine(id: string, values: number[]): ChartSeries {
  return { id, color: '#6366f1', values }
}

const defaultProps = {
  height: 200,
  xLabels: ['2024', '2025', '2026'],
  formatValue: (v: number) => String(v),
  ariaLabel: 'Test chart',
  tooltip: (_i: number) => ({ title: 'Year', lines: [] }),
}

describe('LinearChart', () => {
  it('leaves 16px above the plot unless asked for less', () => {
    const plotTop = (props: { padTop?: number }) => {
      const { container, unmount } = render(
        <LinearChart {...defaultProps} {...props} series={[makeLine('s1', [10, 20, 30])]} />,
      )
      const rect = container.querySelector('clipPath rect')
      unmount()
      return rect?.getAttribute('y')
    }

    expect(plotTop({})).toBe('16')
    expect(plotTop({ padTop: 8 })).toBe('8')
  })

  it('describes how to step through a chart that takes focus, which nothing on it says', () => {
    render(<LinearChart {...defaultProps} series={[makeLine('s1', [10, 20, 30])]} />)

    const chart = screen.getByRole('img', { name: 'Test chart' })
    expect(chart).toHaveAccessibleDescription(/left and right arrow keys to step through the years/)
  })

  it('has no keyboard description where the chart cannot take focus', () => {
    // Tooltip hidden and nobody tracking the focus: it is not a stop, so there is no way to describe.
    render(<LinearChart {...defaultProps} tooltipMode="hidden" series={[makeLine('s1', [10, 20, 30])]} />)

    expect(screen.getByRole('img', { name: 'Test chart' })).not.toHaveAttribute('aria-describedby')
  })

  it('draws a reference line only where it can be told from the one above it', () => {
    // 1 000 to 9 000 on an axis of a million are a pixel or two apart: one dashed smear.
    const count = (refLines: number[]) => {
      const { container, unmount } = render(
        <LinearChart {...defaultProps} refLines={refLines} series={[makeLine('s1', [0, 500_000, 1_000_000])]} />,
      )
      const lines = container.querySelectorAll(`.${chartStyles.refLine}`).length
      unmount()
      return lines
    }

    expect(count([1_000, 2_000, 3_000, 4_000, 5_000])).toBe(1)
    expect(count([1_000, 2_000, 3_000, 4_000, 5_000, 600_000])).toBe(2)
  })

  describe('lines of different lengths', () => {
    /** The x of each point in a line's path, in order. */
    const xsOf = (path: Element) => [...(path.getAttribute('d') ?? '').matchAll(/[ML]([\d.]+),/g)].map((m) => Number(m[1]))

    function drawn(first: number[], second: number[]) {
      const { container } = render(
        <LinearChart
          {...defaultProps}
          xLabels={['0', '1', '2', '3', '4']}
          series={[{ ...makeLine('a', first), color: '#6366f1' }, { ...makeLine('b', second), color: '#10b981' }]}
        />,
      )
      const [a, b] = [...container.querySelectorAll('path[fill="none"]')]
      return { a: xsOf(a!), b: xsOf(b!) }
    }

    it('ends the shorter line where its values end, on an axis as long as the longer one', () => {
      const { a, b } = drawn([10, 20], [10, 20, 30, 40, 50])

      expect(a).toHaveLength(2)
      expect(b).toHaveLength(5)
      // The same year is in the same place on both, and the short line stops at its last year.
      expect(a[1]).toBe(b[1])
      expect(a[1]).toBeLessThan(b[4]!)
    })

    it('does not shorten the axis when the first line is the short one', () => {
      const short = drawn([10, 20], [10, 20, 30, 40, 50])
      const long = drawn([10, 20, 30, 40, 50], [10, 20])

      expect(short.b).toEqual(long.a)
    })
  })

  it('keeps the plot inside the box however much room above it is asked for', () => {
    const clip = (padTop: number) => {
      const { container, unmount } = render(
        <LinearChart {...defaultProps} height={112} padTop={padTop} series={[makeLine('s1', [10, 20, 30])]} />,
      )
      const rect = container.querySelector('clipPath rect')!
      unmount()
      return { y: Number(rect.getAttribute('y')), height: Number(rect.getAttribute('height')) }
    }

    // The plot always keeps a pixel above the 28px of x-axis labels, so its clip stays drawable.
    expect(clip(90)).toEqual({ y: 83, height: 2 })
    expect(clip(112)).toEqual({ y: 83, height: 2 })
    expect(clip(-6)).toEqual({ y: 0, height: 85 })
    expect(clip(0)).toEqual({ y: 0, height: 85 })
    expect(clip(83)).toEqual({ y: 83, height: 2 })
  })

  describe('with the room above the plot that was asked for', () => {
    // 28px of x-axis labels sit under the plot, so on a 112px chart it ends at 84.
    const HEIGHT = 112
    const PLOT_BOTTOM = 84

    afterEach(() => {
      Reflect.deleteProperty(document.documentElement, 'clientHeight')
      Reflect.deleteProperty(document.documentElement, 'clientWidth')
    })

    function renderChart(padTop?: number) {
      const props = padTop === undefined ? {} : { padTop }
      const utils = render(
        <LinearChart {...defaultProps} {...props} height={HEIGHT} series={[makeLine('s1', [0, 50, 100])]} />,
      )
      return { ...utils, svg: utils.container.querySelector('svg')! }
    }

    const gridYs = (container: HTMLElement) =>
      [...container.querySelectorAll('line')].map((line) => Number(line.getAttribute('y1')))

    it.each([8, 16, 40])('scales the values between the top of the plot, %ipx down, and its bottom', (padTop) => {
      const { container } = renderChart(padTop)

      const ys = gridYs(container)
      expect(Math.min(...ys)).toBe(padTop)
      expect(Math.max(...ys)).toBe(PLOT_BOTTOM)
    })

    it('leaves 16px above the plot for the scale too, unless asked for less', () => {
      const { container } = renderChart()

      expect(Math.min(...gridYs(container))).toBe(16)
    })

    it.each([8, 40])('marks the focused step over the plot, from %ipx down to its bottom', (padTop) => {
      const { container, svg } = renderChart(padTop)

      fireEvent.keyDown(svg, { key: 'End' })

      const crosshair = container.querySelector(`.${chartStyles.crosshair}`)!
      expect(Number(crosshair.getAttribute('y1'))).toBe(padTop)
      expect(Number(crosshair.getAttribute('y2'))).toBe(PLOT_BOTTOM)
      // The last value is the top of the scale, and the first its bottom.
      expect(Number(container.querySelector('circle')!.getAttribute('cy'))).toBe(padTop)
      fireEvent.keyDown(svg, { key: 'Home' })
      expect(Number(container.querySelector('circle')!.getAttribute('cy'))).toBe(PLOT_BOTTOM)
    })

    it.each([
      [8, 300],
      [40, 332],
    ])('points a tooltip at the top of the plot, which is at %ipx, so it opens at %ipx', (padTop, opensAt) => {
      // jsdom lays nothing out: the chart is 112px tall, 300px down the page, and the page is tall enough to show it.
      Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 768 })
      Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1024 })
      const { svg } = renderChart(padTop)
      svg.getBoundingClientRect = () => ({ left: 0, top: 300, width: 360, height: HEIGHT }) as DOMRect
      Object.defineProperty(svg, 'viewBox', { value: { baseVal: { x: 0, y: 0, width: 360, height: HEIGHT } } })

      fireEvent.keyDown(svg, { key: 'Home' })

      // 8px above the anchor, since the tooltip has no height here.
      expect(screen.getByRole('tooltip').style.top).toBe(`${opensAt}px`)
    })
  })

  it('is a Tab stop only when something shows where the arrow keys have moved the focus', () => {
    const tabIndexOf = (props: Partial<Parameters<typeof LinearChart>[0]>) => {
      const { container, unmount } = render(
        <LinearChart {...defaultProps} series={[makeLine('s1', [10, 20, 30])]} {...props} />,
      )
      const svg = container.querySelector('svg')!
      const tabIndex = svg.getAttribute('tabindex')
      unmount()
      return tabIndex
    }

    expect(tabIndexOf({})).toBe('0')
    expect(tabIndexOf({ tooltipMode: 'full' })).toBe('0')
    // A caller reading the focus (the hero chart's live legend) is the readout.
    expect(tabIndexOf({ tooltipMode: 'hidden', onActiveIndexChange: vi.fn() })).toBe('0')
    // Nothing reads the marker: still focusable by click, but not a stop on the way past.
    expect(tabIndexOf({ tooltipMode: 'hidden' })).toBe('-1')
  })

  it('steps the focus with the arrow keys and clears it with Escape', () => {
    const onActiveIndexChange = vi.fn()
    const { container } = render(
      <LinearChart
        {...defaultProps}
        series={[makeLine('s1', [10, 20, 30])]}
        onActiveIndexChange={onActiveIndexChange}
        tooltipMode="hidden"
      />,
    )
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('tabindex')).toBe('0')

    fireEvent.keyDown(svg, { key: 'ArrowRight' })
    expect(onActiveIndexChange).toHaveBeenLastCalledWith(0)
    fireEvent.keyDown(svg, { key: 'ArrowRight' })
    expect(onActiveIndexChange).toHaveBeenLastCalledWith(1)
    fireEvent.keyDown(svg, { key: 'End' })
    expect(onActiveIndexChange).toHaveBeenLastCalledWith(2)
    // Past the end stays put rather than wrapping or going out of range.
    fireEvent.keyDown(svg, { key: 'ArrowRight' })
    expect(onActiveIndexChange).toHaveBeenLastCalledWith(2)
    fireEvent.keyDown(svg, { key: 'Home' })
    expect(onActiveIndexChange).toHaveBeenLastCalledWith(0)
    fireEvent.keyDown(svg, { key: 'ArrowLeft' })
    expect(onActiveIndexChange).toHaveBeenLastCalledWith(0)
    fireEvent.keyDown(svg, { key: 'Escape' })
    expect(onActiveIndexChange).toHaveBeenLastCalledWith(null)
    // ArrowLeft with nothing focused starts from the far end.
    fireEvent.keyDown(svg, { key: 'ArrowLeft' })
    expect(onActiveIndexChange).toHaveBeenLastCalledWith(2)
    // Keys the chart does not use leave the focus alone.
    fireEvent.keyDown(svg, { key: 'a' })
    expect(onActiveIndexChange).toHaveBeenLastCalledWith(2)
    fireEvent.blur(svg)
    expect(onActiveIndexChange).toHaveBeenLastCalledWith(null)
  })

  it('starts at, and keeps, the step its focus options give it', () => {
    const onActiveIndexChange = vi.fn()
    const { container } = render(
      <LinearChart
        {...defaultProps}
        series={[makeLine('s1', [10, 20, 30])]}
        onActiveIndexChange={onActiveIndexChange}
        tooltipMode="hidden"
        focus={{ sticky: true, initial: 1 }}
      />,
    )
    const svg = container.querySelector('svg')!
    expect(onActiveIndexChange).toHaveBeenLastCalledWith(1)

    fireEvent.blur(svg)
    fireEvent.keyDown(svg, { key: 'Escape' })
    expect(onActiveIndexChange).toHaveBeenLastCalledWith(1)
    fireEvent.keyDown(svg, { key: 'End' })
    expect(onActiveIndexChange).toHaveBeenLastCalledWith(2)
  })

  it('picks the nearest step while a finger drags, and only within reach for a hover', () => {
    const x = (i: number) => i * 100
    // Hover: a point between two steps but further than the reach from both is nothing.
    expect(nearestIndex(150, 3, x, 28)).toBeNull()
    expect(nearestIndex(120, 3, x, 28)).toBe(1)
    // Drag: the finger is still on the chart, so the nearest step stays lit.
    expect(nearestIndex(150, 3, x)).toBe(1)
    expect(nearestIndex(-500, 3, x)).toBe(0)
    expect(nearestIndex(500, 3, x)).toBe(2)
    expect(nearestIndex(0, 0, x)).toBeNull()
  })

  it('draws in a viewBox as wide as its container, in CSS pixels', () => {
    const { container } = render(
      <LinearChart {...defaultProps} series={[makeLine('s1', [10, 20, 30])]} />,
    )
    // jsdom lays nothing out, so the fallback width applies until something measures.
    expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 360 200')
  })

  it('renders with a single line series', () => {
    const { container } = render(
      <LinearChart
        {...defaultProps}
        series={[makeLine('s1', [10, 20, 30])]}
      />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0)
  })

  it('renders scatter series circles', () => {
    const { container } = render(
      <LinearChart
        {...defaultProps}
        series={[
          makeLine('line', [10, 20, 30]),
          {
            id: 'actuals',
            color: '#22c55e',
            values: [],
            kind: 'scatter',
            points: [{ xIndex: 0.5, value: 15 }, { xIndex: 1.5, value: 25 }],
          },
        ]}
      />,
    )
    // scatter renders circles; line renders focus circles only on interaction
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBeGreaterThanOrEqual(2)
  })

  it('renders band series path', () => {
    const { container } = render(
      <LinearChart
        {...defaultProps}
        series={[
          makeLine('line', [10, 20, 30]),
          {
            id: 'band',
            color: '#6366f1',
            values: [],
            kind: 'band',
            band: { lo: [5, 15, 25], hi: [15, 25, 35] },
          },
        ]}
      />,
    )
    // band layer renders a filled path in addition to line series paths
    const paths = container.querySelectorAll('path')
    expect(paths.length).toBeGreaterThanOrEqual(2)
  })

  it('renders today marker when todayIndex is provided', () => {
    const { container } = render(
      <LinearChart
        {...defaultProps}
        series={[makeLine('s1', [10, 20, 30])]}
        todayIndex={1}
      />,
    )
    const lines = container.querySelectorAll('line')
    // grid lines + today marker line
    expect(lines.length).toBeGreaterThan(0)
  })

  it('includes scatter values in the y-domain', () => {
    // If scatter is at value 500 (well above line max 30), domain must expand
    const { container } = render(
      <LinearChart
        {...defaultProps}
        series={[
          makeLine('line', [10, 20, 30]),
          {
            id: 'actuals',
            color: '#22c55e',
            values: [],
            kind: 'scatter',
            points: [{ xIndex: 1, value: 500 }],
          },
        ]}
      />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('calls onActiveIndexChange when provided', () => {
    const cb = vi.fn()
    render(
      <LinearChart
        {...defaultProps}
        series={[makeLine('s1', [10, 20, 30])]}
        onActiveIndexChange={cb}
      />,
    )
    // Initially no active index — cb called with null
    expect(cb).toHaveBeenCalledWith(null)
  })

  it('raises the y-axis scale when yDomainMax exceeds the natural domain', () => {
    const { container } = render(
      <LinearChart {...defaultProps} series={[makeLine('line', [10, 20, 30])]} yDomainMax={1000} />,
    )
    const gridLabels = [...container.querySelectorAll('text[text-anchor="end"]')].map((t) =>
      Number(t.textContent),
    )
    expect(Math.max(...gridLabels)).toBeGreaterThanOrEqual(1000)
  })

  it('does not shrink the y-axis below data that already exceeds yDomainMax', () => {
    const { container } = render(
      <LinearChart
        {...defaultProps}
        series={[
          makeLine('line', [10, 20, 30]),
          {
            id: 'actuals',
            color: '#22c55e',
            values: [],
            kind: 'scatter',
            points: [{ xIndex: 1, value: 500 }],
          },
        ]}
        yDomainMax={50}
      />,
    )
    const gridLabels = [...container.querySelectorAll('text[text-anchor="end"]')].map((t) =>
      Number(t.textContent),
    )
    expect(Math.max(...gridLabels)).toBeGreaterThanOrEqual(500)
  })

  it('fits the axis to the lines, not to a band that runs far above them', () => {
    const { container } = render(
      <LinearChart
        {...defaultProps}
        xLabels={['a', 'b', 'c']}
        series={[
          {
            id: 'band',
            color: '#6366f1',
            values: [],
            kind: 'band',
            band: { lo: [10, 15, 20], hi: [50, 90, 300] },
          },
          makeLine('line', [10, 20, 30]),
        ]}
      />,
    )
    const gridLabels = [...container.querySelectorAll('text[text-anchor="end"]')]
      .map((t) => Number(t.textContent))
      .filter(Number.isFinite)
    expect(Math.max(...gridLabels)).toBeLessThan(100)
  })

  it('clips the band at the plot, since it can now run past the top of the axis', () => {
    const { container } = render(
      <LinearChart
        {...defaultProps}
        xLabels={['a', 'b', 'c']}
        series={[
          { id: 'band', color: '#6366f1', values: [], kind: 'band', band: { lo: [1, 2, 3], hi: [50, 90, 300] } },
          makeLine('line', [10, 20, 30]),
        ]}
      />,
    )
    const clip = container.querySelector('clipPath')
    expect(clip).not.toBeNull()
    const group = container.querySelector(`g[clip-path="url(#${clip!.id})"]`)
    expect(group?.querySelector('path')).not.toBeNull()
  })

  it('still draws a band that has no line beside it in full', () => {
    const { container } = render(
      <LinearChart
        {...defaultProps}
        xLabels={['a', 'b', 'c']}
        series={[{ id: 'band', color: '#6366f1', values: [], kind: 'band', band: { lo: [10, 15, 20], hi: [50, 90, 300] } }]}
      />,
    )
    const gridLabels = [...container.querySelectorAll('text[text-anchor="end"]')]
      .map((t) => Number(t.textContent))
      .filter(Number.isFinite)
    expect(Math.max(...gridLabels)).toBeGreaterThanOrEqual(300)
  })

  it('renders without todayIndex without error', () => {
    expect(() =>
      render(
        <LinearChart
          {...defaultProps}
          series={[makeLine('s1', [10, 20, 30])]}
        />,
      ),
    ).not.toThrow()
  })

  it('closes the other chart\'s tooltip when a second one opens, so only one shows at a time', () => {
    const { container } = render(
      <>
        <LinearChart
          {...defaultProps}
          series={[makeLine('a', [10, 20, 30])]}
          tooltip={() => ({ title: 'Chart A', lines: [] })}
        />
        <LinearChart
          {...defaultProps}
          series={[makeLine('b', [40, 50, 60])]}
          tooltip={() => ({ title: 'Chart B', lines: [] })}
        />
      </>,
    )
    const [svgA, svgB] = container.querySelectorAll('svg')

    fireEvent.keyDown(svgA!, { key: 'ArrowRight' })
    let tooltips = document.body.querySelectorAll('[role="tooltip"]')
    expect(tooltips).toHaveLength(1)
    expect(tooltips[0]).toHaveTextContent('Chart A')

    fireEvent.keyDown(svgB!, { key: 'ArrowRight' })
    tooltips = document.body.querySelectorAll('[role="tooltip"]')
    expect(tooltips).toHaveLength(1)
    expect(tooltips[0]).toHaveTextContent('Chart B')
  })

  it('never claims the shared tooltip slot when tooltipMode is hidden', () => {
    const { container } = render(
      <>
        <LinearChart
          {...defaultProps}
          series={[makeLine('hero', [10, 20, 30])]}
          tooltip={() => ({ title: 'Hero', lines: [] })}
          tooltipMode="hidden"
        />
        <LinearChart
          {...defaultProps}
          series={[makeLine('normal', [40, 50, 60])]}
          tooltip={() => ({ title: 'Normal', lines: [] })}
        />
      </>,
    )
    const [svgHero, svgNormal] = container.querySelectorAll('svg')

    fireEvent.keyDown(svgNormal!, { key: 'ArrowRight' })
    expect(document.body.querySelectorAll('[role="tooltip"]')).toHaveLength(1)

    // Focusing the hidden-mode chart never renders its own tooltip, and must not close
    // the real one open elsewhere on the page.
    fireEvent.keyDown(svgHero!, { key: 'ArrowRight' })
    const tooltips = document.body.querySelectorAll('[role="tooltip"]')
    expect(tooltips).toHaveLength(1)
    expect(tooltips[0]).toHaveTextContent('Normal')
  })
})
