import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  ChartBandLayer,
  ChartScatterLayer,
  ChartTodayMarker,
  ChartPurchaseMarkers,
  ChartLifeEventMarkers,
  ChartLabeledMarkers,
  ChartFocusIndicator,
} from './linearChartParts'

const xForIndex = (i: number) => i * 10
const scaleY = (v: number) => 100 - v

function renderInSvg(children: React.ReactNode) {
  const { container } = render(
    <svg viewBox="0 0 200 200">{children}</svg>,
  )
  return container.querySelector('svg')!
}

describe('ChartBandLayer', () => {
  it('renders a path element', () => {
    const svg = renderInSvg(
      <ChartBandLayer
        color="#6366f1"
        lo={[0, 0, 0]}
        hi={[10, 20, 30]}
        xForIndex={xForIndex}
        scaleY={scaleY}
      />,
    )
    expect(svg.querySelector('path')).not.toBeNull()
  })

  it('applies fill color via style prop', () => {
    const svg = renderInSvg(
      <ChartBandLayer
        color="#ff0000"
        lo={[0, 0]}
        hi={[5, 5]}
        xForIndex={xForIndex}
        scaleY={scaleY}
      />,
    )
    const path = svg.querySelector('path')!
    const style = path.getAttribute('style') ?? ''
    // React serializes the style object; check fill is present
    expect(style).toMatch(/fill/)
  })
})

describe('ChartScatterLayer', () => {
  it('renders one circle per point', () => {
    const svg = renderInSvg(
      <ChartScatterLayer
        color="#22c55e"
        points={[
          { xIndex: 2, value: 50 },
          { xIndex: 5, value: 80 },
        ]}
        xForIndex={xForIndex}
        scaleY={scaleY}
      />,
    )
    expect(svg.querySelectorAll('circle')).toHaveLength(2)
  })

  it('joins the points in x order when asked to connect them', () => {
    const svg = renderInSvg(
      <ChartScatterLayer
        color="#22c55e"
        points={[
          { xIndex: 5, value: 80 },
          { xIndex: 2, value: 50 },
        ]}
        xForIndex={xForIndex}
        scaleY={scaleY}
        connect
      />,
    )
    expect(svg.querySelector('path')?.getAttribute('d')).toBe('M20.0,50.0 L50.0,20.0')
    expect(svg.querySelectorAll('circle')).toHaveLength(2)
  })

  it('draws no line for a single point, even when connecting', () => {
    const svg = renderInSvg(
      <ChartScatterLayer
        color="#22c55e"
        points={[{ xIndex: 3, value: 40 }]}
        xForIndex={xForIndex}
        scaleY={scaleY}
        connect
      />,
    )
    expect(svg.querySelector('path')).toBeNull()
  })

  it('positions circles using xForIndex and scaleY', () => {
    const svg = renderInSvg(
      <ChartScatterLayer
        color="#22c55e"
        points={[{ xIndex: 3, value: 40 }]}
        xForIndex={xForIndex}
        scaleY={scaleY}
      />,
    )
    const circle = svg.querySelector('circle')!
    expect(circle.getAttribute('cx')).toBe('30')
    expect(circle.getAttribute('cy')).toBe('60')
  })

  it('renders nothing when points is empty', () => {
    const svg = renderInSvg(
      <ChartScatterLayer
        color="#22c55e"
        points={[]}
        xForIndex={xForIndex}
        scaleY={scaleY}
      />,
    )
    expect(svg.querySelectorAll('circle')).toHaveLength(0)
  })
})

describe('ChartTodayMarker', () => {
  it('renders a vertical line', () => {
    const svg = renderInSvg(<ChartTodayMarker x={50} yTop={10} yBottom={90} />)
    const line = svg.querySelector('line')!
    expect(line.getAttribute('x1')).toBe('50')
    expect(line.getAttribute('x2')).toBe('50')
    expect(line.getAttribute('y1')).toBe('10')
    expect(line.getAttribute('y2')).toBe('90')
  })
})

describe('ChartPurchaseMarkers', () => {
  it('renders lines for each marker year', () => {
    const svg = renderInSvg(
      <ChartPurchaseMarkers
        markerYears={[{ yearIndex: 3 }, { yearIndex: 7 }]}
        xForIndex={xForIndex}
        yTop={10}
        innerH={80}
      />,
    )
    // Two groups, each with 2 lines
    expect(svg.querySelectorAll('line')).toHaveLength(4)
  })

  it('renders nothing when markerYears is empty', () => {
    const svg = renderInSvg(
      <ChartPurchaseMarkers markerYears={[]} xForIndex={xForIndex} yTop={10} innerH={80} />,
    )
    expect(svg.querySelectorAll('line')).toHaveLength(0)
  })
})

describe('ChartLifeEventMarkers', () => {
  it('renders a polygon for each marker', () => {
    const svg = renderInSvg(
      <ChartLifeEventMarkers
        markers={[
          { yearIndex: 2, label: 'Bonus', amountCents: 10_000_000 },
          { yearIndex: 5, label: 'Car', amountCents: -3_000_000 },
        ]}
        xForIndex={xForIndex}
        yTop={10}
      />,
    )
    expect(svg.querySelectorAll('polygon')).toHaveLength(2)
  })

  it('renders an inflow marker and an outflow marker with different aria-labels', () => {
    const svg = renderInSvg(
      <ChartLifeEventMarkers
        markers={[
          { yearIndex: 1, label: 'Inheritance', amountCents: 50_000_000 },
          { yearIndex: 4, label: 'Big purchase', amountCents: -20_000_000 },
        ]}
        xForIndex={xForIndex}
        yTop={5}
      />,
    )
    expect(svg.querySelector('[aria-label="Inheritance"]')).not.toBeNull()
    expect(svg.querySelector('[aria-label="Big purchase"]')).not.toBeNull()
  })

  it('renders nothing when markers array is empty', () => {
    const svg = renderInSvg(
      <ChartLifeEventMarkers markers={[]} xForIndex={xForIndex} yTop={10} />,
    )
    expect(svg.querySelectorAll('polygon')).toHaveLength(0)
  })
})

describe('ChartFocusIndicator', () => {
  const lineSeries = [
    { id: 's1', color: '#6366f1', values: [0, 100, 200, 300] },
  ]

  it('returns null when active is null', () => {
    const svg = renderInSvg(
      <ChartFocusIndicator
        active={null}
        focusX={50}
        yTop={10}
        innerH={80}
        scaleY={scaleY}
        lineSeries={lineSeries}
      />,
    )
    expect(svg.querySelectorAll('line')).toHaveLength(0)
    expect(svg.querySelectorAll('circle')).toHaveLength(0)
  })

  it('renders crosshair line and one circle per series when active', () => {
    const svg = renderInSvg(
      <ChartFocusIndicator
        active={2}
        focusX={50}
        yTop={10}
        innerH={80}
        scaleY={scaleY}
        lineSeries={lineSeries}
      />,
    )
    expect(svg.querySelector('line')).not.toBeNull()
    expect(svg.querySelectorAll('circle')).toHaveLength(1)
  })

  it('draws no point for a line that has ended by the active place, instead of one at zero', () => {
    const svg = renderInSvg(
      <ChartFocusIndicator
        active={3}
        focusX={30}
        yTop={10}
        innerH={80}
        scaleY={scaleY}
        lineSeries={[
          { id: 'short', color: '#6366f1', values: [0, 100] },
          { id: 'long', color: '#10b981', values: [0, 100, 200, 300] },
        ]}
      />,
    )

    const circles = [...svg.querySelectorAll('circle')]
    expect(circles).toHaveLength(1)
    expect(circles[0]!.getAttribute('cy')).toBe(String(scaleY(300)))
    expect(svg.querySelector('line')).not.toBeNull()
  })
})

describe('ChartLabeledMarkers', () => {
  const place = { xForIndex, yTop: 10, innerH: 100, left: 0, right: 200 }

  it('draws a dashed line the height of the plot and a label beside it, for each marker', () => {
    const svg = renderInSvg(
      <ChartLabeledMarkers {...place} markers={[{ index: 5, label: 'Loan paid off' }]} />,
    )
    const line = svg.querySelector('line')!
    expect(line.getAttribute('x1')).toBe('50')
    expect(line.getAttribute('y1')).toBe('10')
    expect(line.getAttribute('y2')).toBe('110')
    const text = svg.querySelector('text')!
    expect(text.textContent).toBe('Loan paid off')
    expect(Number(text.getAttribute('x'))).toBeGreaterThan(50)
    expect(text.getAttribute('text-anchor')).toBe('start')
  })

  it('puts a label that would run off the right edge on the left of its line', () => {
    const svg = renderInSvg(
      <ChartLabeledMarkers {...place} markers={[{ index: 19, label: 'Loan paid off' }]} />,
    )
    const text = svg.querySelector('text')!
    expect(text.getAttribute('text-anchor')).toBe('end')
    expect(Number(text.getAttribute('x'))).toBeLessThan(190)
  })

  it('puts a label that would run into the one before it on a second row', () => {
    const svg = renderInSvg(
      <ChartLabeledMarkers
        {...place}
        right={400}
        markers={[
          { index: 4, label: 'Owning costs less than renting' },
          { index: 6, label: 'Loan paid off' },
        ]}
      />,
    )
    const [first, second] = [...svg.querySelectorAll('text')]
    expect(Number(second!.getAttribute('y'))).toBeGreaterThan(Number(first!.getAttribute('y')))
  })

  it('keeps two labels that are far apart on one row', () => {
    const svg = renderInSvg(
      <ChartLabeledMarkers
        {...place}
        right={400}
        markers={[
          { index: 1, label: 'Loan paid off' },
          { index: 12, label: 'Owning costs less than renting' },
        ]}
      />,
    )
    const [first, second] = [...svg.querySelectorAll('text')]
    expect(second!.getAttribute('y')).toBe(first!.getAttribute('y'))
  })

  it('draws nothing without markers', () => {
    expect(renderInSvg(<ChartLabeledMarkers {...place} markers={undefined} />).querySelector('line')).toBeNull()
    expect(renderInSvg(<ChartLabeledMarkers {...place} markers={[]} />).querySelector('text')).toBeNull()
  })

  it('leaves the lines to the pointer and the label to the reader of the chart', () => {
    const svg = renderInSvg(<ChartLabeledMarkers {...place} markers={[{ index: 5, label: 'Loan paid off' }]} />)
    expect(svg.querySelector('line')!.getAttribute('aria-hidden')).toBe('true')
    expect(svg.querySelector('text')!.getAttribute('aria-hidden')).toBeNull()
  })

  it('keeps a label that fits on neither side of its line inside the plot, from its left edge', () => {
    const svg = renderInSvg(
      <ChartLabeledMarkers {...place} left={56} right={200} markers={[{ index: 10, label: 'Owning costs less than renting' }]} />,
    )
    const text = svg.querySelector('text')!
    expect(text.getAttribute('text-anchor')).toBe('start')
    expect(Number(text.getAttribute('x'))).toBeGreaterThanOrEqual(56)
  })

  it('gives a marker the long form of its label as a title', () => {
    const svg = renderInSvg(
      <ChartLabeledMarkers {...place} markers={[{ index: 5, label: 'Loan paid off', title: 'The loan is paid off here.' }]} />,
    )
    expect(svg.querySelector('title')!.textContent).toBe('The loan is paid off here.')
    expect(renderInSvg(<ChartLabeledMarkers {...place} markers={[{ index: 5, label: 'Loan paid off' }]} />).querySelector('title')).toBeNull()
  })
})
