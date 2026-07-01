import { describe, expect, it } from 'vitest'
import { buildPeriodFilter, defaultCustomDateRange, isSecondaryDateScope, scopeChipLabel } from './txnDateScope'

describe('buildPeriodFilter', () => {
  it('uses budget month by default', () => {
    expect(buildPeriodFilter('budgetMonth', '2026-07', '', '')).toEqual({ month: '2026-07' })
  })

  it('uses last three calendar months ending at the viewed month', () => {
    expect(buildPeriodFilter('last3Months', '2026-07', '', '')).toEqual({
      dateFrom: '2026-05-01',
      dateTo: '2026-07-31',
    })
  })

  it('drops month filter for all dates', () => {
    expect(buildPeriodFilter('allDates', '2026-07', '', '')).toEqual({})
  })

  it('passes custom from/to when set', () => {
    expect(buildPeriodFilter('custom', '2026-07', '2026-01-01', '2026-06-30')).toEqual({
      dateFrom: '2026-01-01',
      dateTo: '2026-06-30',
    })
  })
})

describe('defaultCustomDateRange', () => {
  it('matches last3Months preset', () => {
    expect(defaultCustomDateRange('2026-07')).toEqual({
      dateFrom: '2026-05-01',
      dateTo: '2026-07-31',
    })
  })
})

describe('scopeChipLabel', () => {
  it('returns null for budget month scope', () => {
    expect(scopeChipLabel('budgetMonth', '', '')).toBeNull()
  })

  it('labels presets and custom ranges', () => {
    expect(scopeChipLabel('last3Months', '', '')).toBe('Dates: last 3 months')
    expect(scopeChipLabel('allDates', '', '')).toBe('Dates: all')
    expect(scopeChipLabel('custom', '2026-05-01', '2026-07-31')).toBe(
      'Dates: 2026-05-01 – 2026-07-31',
    )
  })
})

describe('isSecondaryDateScope', () => {
  it('treats non-default scopes as secondary filters', () => {
    expect(isSecondaryDateScope('budgetMonth')).toBe(false)
    expect(isSecondaryDateScope('last3Months')).toBe(true)
  })
})
