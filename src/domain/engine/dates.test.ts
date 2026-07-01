import { describe, expect, it } from 'vitest'
import { calendarRangeLastMonths, lastDayOfBudgetMonth, priorBudgetMonth } from './dates'

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
