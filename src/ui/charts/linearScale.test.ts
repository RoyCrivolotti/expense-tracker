import { describe, expect, it } from 'vitest'
import { collectDomain, linePath, makeScale, niceScale, sparseLabels, stackAreas } from './linearScale'

describe('makeScale', () => {
  it('maps domain endpoints to range endpoints', () => {
    const s = makeScale(0, 10, 100, 0)
    expect(s(0)).toBe(100)
    expect(s(10)).toBe(0)
    expect(s(5)).toBe(50)
  })

  it('does not divide by zero for a flat domain', () => {
    const s = makeScale(5, 5, 0, 100)
    expect(Number.isFinite(s(5))).toBe(true)
  })
})

describe('niceScale', () => {
  it('rounds the range outward to readable ticks', () => {
    const { min, max, ticks } = niceScale(0, 93)
    expect(min).toBe(0)
    expect(max).toBeGreaterThanOrEqual(93)
    expect(ticks[0]).toBe(0)
    expect(ticks[ticks.length - 1]).toBe(max)
  })

  it('handles negative minimums', () => {
    const { min, max } = niceScale(-40, 120)
    expect(min).toBeLessThanOrEqual(-40)
    expect(max).toBeGreaterThanOrEqual(120)
  })
})

describe('collectDomain', () => {
  it('always includes zero and spans values + reference lines', () => {
    const { min, max } = collectDomain([[10, 20], [-5]], [50])
    expect(min).toBe(-5)
    expect(max).toBe(50)
  })

  it('fits the values in view when asked to leave zero out', () => {
    const { min, max } = collectDomain([[1_000_000, 1_060_000]], [], false)
    expect(min).toBe(1_000_000)
    expect(max).toBe(1_060_000)
    expect(collectDomain([[]], [], false)).toEqual({ min: 0, max: 0 })
  })

  it('ignores a non-finite reference line instead of losing the domain to it', () => {
    const { min, max } = collectDomain([[10, 20]], [Infinity])
    expect(min).toBe(0)
    expect(max).toBe(20)

    // The bound that mattered: a scale built from this domain has to map real points
    // to real pixels. Before the filter these came back NaN, which blanked the chart.
    const nice = niceScale(min, max)
    expect(Number.isFinite(nice.min)).toBe(true)
    expect(Number.isFinite(nice.max)).toBe(true)
    expect(makeScale(nice.min, nice.max, 100, 0)(20)).toBeCloseTo(0)
  })

  it('survives a series that is entirely non-finite', () => {
    const { min, max } = collectDomain([[Infinity, NaN]], [])
    expect(min).toBe(0)
    expect(max).toBe(0)
  })
})

describe('stackAreas', () => {
  it('stacks positives upward and negatives downward from zero', () => {
    const [invested, house, mortgage] = stackAreas([[100], [40], [-30]])
    expect(invested).toEqual({ lo: [0], hi: [100] })
    expect(house).toEqual({ lo: [100], hi: [140] })
    expect(mortgage).toEqual({ lo: [-30], hi: [0] })
  })
})

describe('linePath', () => {
  it('builds an SVG path starting with a move command', () => {
    expect(linePath([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe('M0.0,0.0 L10.0,5.0')
  })
})

describe('sparseLabels', () => {
  it('keeps every step-th label and the last', () => {
    const labels = sparseLabels([2020, 2021, 2022, 2023, 2024], 2)
    expect(labels[0]).toBe('2020')
    expect(labels[1]).toBe('')
    expect(labels[2]).toBe('2022')
    expect(labels[3]).toBe('')
    expect(labels[4]).toBe('2024')
  })
})
