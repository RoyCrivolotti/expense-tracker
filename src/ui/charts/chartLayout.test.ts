import { describe, expect, it } from 'vitest'
import { chartAxis } from './chartLayout'

describe('chartAxis', () => {
  it('tops the axis just above the data rather than at the next power-of-ten step', () => {
    // A 2.1k peak used to get a 5k axis, so the bars filled less than half the chart.
    const { max, ticks } = chartAxis([2_100, 900])
    expect(max).toBeGreaterThanOrEqual(2_100)
    expect(max).toBeLessThan(2_100 * 1.09)
    expect(ticks[0]).toBe(0)
    expect(ticks.every((t) => t <= max)).toBe(true)
  })

  it('has one gridline per value, even for an empty chart', () => {
    const { max, ticks } = chartAxis([0, 0])
    expect(max).toBeGreaterThan(0)
    expect(new Set(ticks).size).toBe(ticks.length)
    expect(chartAxis([]).max).toBe(max)
  })
})
