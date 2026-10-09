import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChartValueTags } from './ChartValueTags'
import type { ValueTagSpec } from './valueTags'

const spec: ValueTagSpec = { format: (v) => `${v}M €`, textOn: (c) => (c === '#fff' ? '#000' : '#fff'), bandLabels: { lo: '3%', hi: '9%' } }
const props = {
  spec,
  active: 1,
  focusX: 100,
  width: 400,
  yTop: 10,
  yBottom: 200,
  scaleY: (v: number) => 200 - v * 10,
  lines: [
    { id: 'a', color: '#fff', values: [1, 2] },
    { id: 'b', color: '#123456', values: [1, 5] },
  ],
  bands: [{ color: '#00f', band: { lo: [0, 1], hi: [0, 9] } }],
  pointLines: [],
}

const wrap = (ui: React.ReactElement) => <svg>{ui}</svg>

describe('ChartValueTags', () => {
  it('draws a tag for each line at the year, and the band\'s over and under', () => {
    const { container } = render(wrap(<ChartValueTags {...props} />))
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toEqual(expect.arrayContaining(['2M €', '5M €', '9% · 9M €', '3% · 1M €']))
  })

  it('writes each tag in the colour that reads on its own', () => {
    const { container } = render(wrap(<ChartValueTags {...props} />))
    const fills = Object.fromEntries([...container.querySelectorAll('text')].map((t) => [t.textContent, (t as SVGElement).style.fill]))
    expect(fills['2M €']).toBe('rgb(0, 0, 0)')
    expect(fills['5M €']).toBe('rgb(255, 255, 255)')
  })

  it('draws lines that read the same as one tag with a dot for each', () => {
    const lines = [
      { id: 'a', color: '#fff', values: [1, 2] },
      { id: 'b', color: '#123456', values: [1, 2] },
      { id: 'c', color: '#654321', values: [1, 2] },
    ]
    const { container } = render(wrap(<ChartValueTags {...props} lines={lines} bands={[]} pointLines={[]} />))
    expect([...container.querySelectorAll('text')].map((t) => t.textContent)).toEqual(['2M €'])
    expect(container.querySelectorAll('circle')).toHaveLength(3)
  })

  it('draws the plan from today as a chip with a dotted edge and a hollow dot on its line', () => {
    const pointLines = [{ id: 'from-today', color: '#654321', points: [{ xIndex: 0, value: 3 }, { xIndex: 2, value: 5 }] }]
    const { container } = render(wrap(<ChartValueTags {...props} pointLines={pointLines} />))
    expect([...container.querySelectorAll('text')].map((t) => t.textContent)).toContain('4M €')
    const rects = [...container.querySelectorAll('rect')]
    expect(rects.some((r) => /valueTagToday/.test(r.getAttribute('class') ?? ''))).toBe(true)
    // The hollow dot is on the line at the focused year, level with its value (4 on this scale).
    const dot = [...container.querySelectorAll('circle')].find((c) => /valueTagTodayDot/.test(c.getAttribute('class') ?? ''))
    expect(dot?.getAttribute('cy')).toBe('160')
  })

  it('draws nothing with no year pointed at, or with no spec', () => {
    expect(render(wrap(<ChartValueTags {...props} active={null} />)).container.querySelector('g')).toBeNull()
    expect(render(wrap(<ChartValueTags {...props} spec={undefined} />)).container.querySelector('g')).toBeNull()
  })
})
