import { describe, expect, it } from 'vitest'
import { defaultHistoryWindow, historyAxis, monthsBetweenDates, xIndexFor } from './historyWindow'

describe('monthsBetweenDates', () => {
  it('counts months in days, so the day of the month moves the result', () => {
    expect(monthsBetweenDates('2026-01-01', '2026-01-01')).toBe(0)
    expect(monthsBetweenDates('2026-01-01', '2026-04-01')).toBeCloseTo(3, 1)
    expect(monthsBetweenDates('2026-01-01', '2026-04-16')).toBeCloseTo(3.5, 0)
    expect(monthsBetweenDates('2025-09-23', '2026-09-23')).toBeCloseTo(12, 1)
  })
})

describe('defaultHistoryWindow', () => {
  it('starts at a year with no check-ins or recent ones', () => {
    expect(defaultHistoryWindow(null, '2026-09-23')).toBe('1y')
    expect(defaultHistoryWindow('2026-03-01', '2026-09-23')).toBe('1y')
  })

  it('widens to hold the earliest check-in', () => {
    expect(defaultHistoryWindow('2025-06-01', '2026-09-23')).toBe('2y')
    expect(defaultHistoryWindow('2022-01-01', '2026-09-23')).toBe('5y')
    expect(defaultHistoryWindow('2010-01-01', '2026-09-23')).toBe('all')
  })
})

describe('historyAxis', () => {
  it('ends today and reaches back one year, month by month', () => {
    const axis = historyAxis('1y', null, '2026-09-23')
    expect(axis.stepMonths).toBe(1)
    expect(axis.steps).toBe(12)
    expect(axis.titles[0]).toBe("Sep '25")
    expect(axis.titles[12]).toBe("Sep '26")
    expect(axis.labels[12]).toBe("Sep '26")
    expect(axis.labels.filter((l) => l !== '').length).toBeLessThanOrEqual(5)
  })

  it('thins the labels when told there is room for fewer', () => {
    const axis = historyAxis('1y', null, '2026-09-23', 3)
    expect(axis.labels.filter((l) => l !== '')).toEqual(["Sep '25", "Mar '26", "Sep '26"])
  })

  it('reaches back to the earliest check-in for All, and never less than a year', () => {
    const wide = historyAxis('all', '2024-03-10', '2026-09-23')
    expect(xIndexFor('2024-03-10', '2026-09-23', wide)).toBeGreaterThanOrEqual(0)
    expect(wide.stepMonths).toBe(3)

    const recent = historyAxis('all', '2026-08-01', '2026-09-23')
    expect(recent.steps * recent.stepMonths).toBe(12)
  })
})

describe('xIndexFor', () => {
  it('puts today on the right edge and a check-in from this month just inside it', () => {
    const axis = historyAxis('1y', null, '2026-09-23')
    expect(xIndexFor('2026-09-23', '2026-09-23', axis)).toBe(12)
    expect(xIndexFor('2026-09-20', '2026-09-23', axis)).toBeCloseTo(11.9, 1)
    expect(xIndexFor('2025-09-23', '2026-09-23', axis)).toBeCloseTo(0, 1)
  })
})
