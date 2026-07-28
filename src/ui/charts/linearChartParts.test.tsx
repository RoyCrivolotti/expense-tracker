import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  ChartBandLayer,
  ChartScatterLayer,
  ChartTodayMarker,
  ChartPurchaseMarkers,
  ChartLifeEventMarkers,
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
})
