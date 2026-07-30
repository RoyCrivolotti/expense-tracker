import { describe, expect, it } from 'vitest'
import {
  calendarRangeLastMonths,
  daysBetween,
  isDueSoon,
  lastDayOfBudgetMonth,
  monthPillLabel,
  monthsSpanMultipleYears,
  priorBudgetMonth,
} from './dates'

describe('lastDayOfBudgetMonth', () => {
  it('returns the last day of July', () => {
    expect(lastDayOfBudgetMonth('2026-07')).toBe('2026-07-31')
  })

  it('handles February in a leap year', () => {
    expect(lastDayOfBudgetMonth('2024-02')).toBe('2024-02-29')
  })
})

describe('calendarRangeLastMonths', () => {
  it('covers three months ending at the viewed budget month', () => {
    expect(calendarRangeLastMonths('2026-07', 3)).toEqual({
      dateFrom: '2026-05-01',
      dateTo: '2026-07-31',
    })
  })

  it('wraps across a year boundary', () => {
    expect(calendarRangeLastMonths('2026-01', 3)).toEqual({
      dateFrom: '2025-11-01',
      dateTo: '2026-01-31',
    })
  })
})

describe('priorBudgetMonth', () => {
  it('steps back within the same year', () => {
    expect(priorBudgetMonth('2026-07')).toBe('2026-06')
  })

  it('wraps across year boundary', () => {
    expect(priorBudgetMonth('2026-01')).toBe('2025-12')
  })
})

describe('daysBetween', () => {
  it('counts forward days', () => {
    expect(daysBetween('2026-07-23', '2026-07-25')).toBe(2)
  })

  it('is negative when the second date is earlier', () => {
    expect(daysBetween('2026-07-23', '2026-07-20')).toBe(-3)
  })

  it('crosses month boundaries', () => {
    expect(daysBetween('2026-07-30', '2026-08-02')).toBe(3)
  })
})

describe('isDueSoon', () => {
  const today = '2026-07-23'

  it('includes overdue dates', () => {
    expect(isDueSoon('2026-07-20', today)).toBe(true)
  })

  it('includes today', () => {
    expect(isDueSoon('2026-07-23', today)).toBe(true)
  })

  it('includes tomorrow', () => {
    expect(isDueSoon('2026-07-24', today)).toBe(true)
  })

  it('excludes the day after tomorrow', () => {
    expect(isDueSoon('2026-07-25', today)).toBe(false)
  })

  it('honours a wider aheadDays window', () => {
    expect(isDueSoon('2026-07-25', today, 2)).toBe(true)
  })
})

describe('monthsSpanMultipleYears', () => {
  it('is false when every month falls in the same year', () => {
    expect(monthsSpanMultipleYears(['2026-01', '2026-06', '2026-12'])).toBe(false)
  })

  it('is true once a second calendar year appears', () => {
    expect(monthsSpanMultipleYears(['2025-11', '2026-01'])).toBe(true)
  })

  it('is false for an empty list', () => {
    expect(monthsSpanMultipleYears([])).toBe(false)
  })
})

describe('monthPillLabel', () => {
  it('omits the year when not needed', () => {
    expect(monthPillLabel('2026-06', false)).toBe('Jun')
  })

  it('appends a two-digit year when disambiguation is needed', () => {
    expect(monthPillLabel('2025-06', true)).toBe("Jun '25")
  })
})
