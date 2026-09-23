import { describe, expect, it } from 'vitest'
import { defaultWindow, stepMonthsFor, windowSeries } from './checkinWindow'

describe('defaultWindow', () => {
  it('starts at a year for a plan that just began', () => {
    expect(defaultWindow(0)).toBe('1y')
    expect(defaultWindow(0.5)).toBe('1y')
  })

  it('widens once today would sit near the right edge', () => {
    expect(defaultWindow(0.8)).toBe('2y')
    expect(defaultWindow(3)).toBe('5y')
    expect(defaultWindow(9.9)).toBe('all')
  })

  it('treats a plan starting in the future as brand new', () => {
    expect(defaultWindow(-2)).toBe('1y')
  })
})

describe('stepMonthsFor', () => {
  it('goes monthly for short windows and coarser as they grow', () => {
    expect(stepMonthsFor(1)).toBe(1)
    expect(stepMonthsFor(2)).toBe(1)
    expect(stepMonthsFor(5)).toBe(3)
    expect(stepMonthsFor(10)).toBe(6)
    expect(stepMonthsFor(30)).toBe(12)
  })
})

describe('windowSeries', () => {
  const points = [
    { year: 0, investedCents: 1_200 },
    { year: 1, investedCents: 2_400 },
    { year: 2, investedCents: 4_800 },
  ]

  it('interpolates the yearly projection month by month from the plan start', () => {
    const s = windowSeries(points, '2026-09-11', 1, 1)
    expect(s.values).toHaveLength(13)
    expect(s.values[0]).toBe(1_200)
    expect(s.values[6]).toBe(1_800)
    expect(s.values[12]).toBe(2_400)
    expect(s.titles[0]).toBe("Sep '26")
    expect(s.titles[12]).toBe("Sep '27")
    expect(s.stepYears).toBeCloseTo(1 / 12)
  })

  it('keeps about five axis labels, always including the last', () => {
    const s = windowSeries(points, '2026-01-01', 2, 1)
    const shown = s.labels.filter((l) => l !== '')
    expect(shown.length).toBeLessThanOrEqual(5)
    expect(s.labels[s.labels.length - 1]).toBe("Jan '28")
  })
})
