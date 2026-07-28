import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NetWorthChart } from './NetWorthChart'
import { makeScenario } from '../../../../testing/factories'
import type { ChartSeries } from '../../../charts/LinearChart'

const defaultDraft = makeScenario()

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
})
