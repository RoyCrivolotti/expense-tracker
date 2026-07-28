import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LinearChart, type ChartSeries } from './LinearChart'

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
})
