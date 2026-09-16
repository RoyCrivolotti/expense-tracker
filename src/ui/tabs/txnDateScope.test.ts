import { describe, expect, it } from 'vitest'
import {
  anchoredDateScope,
  buildPeriodFilter,
  defaultCustomDateRange,
  isSecondaryDateScope,
  scopeChipLabel,
} from './txnDateScope'

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

describe('anchoredDateScope', () => {
  it('keeps the chosen scope until the user moves the month', () => {
    expect(anchoredDateScope({ scope: 'allDates', atNavigation: 4 }, 4)).toBe('allDates')
    expect(anchoredDateScope({ scope: 'custom', atNavigation: 4 }, 4)).toBe('custom')
  })

  it('shows the month once the user moves it away from All or Custom', () => {
    // Those two ignore the header, so without this the header reads March while the
    // list is still on whatever range was chosen.
    expect(anchoredDateScope({ scope: 'allDates', atNavigation: 4 }, 5)).toBe('budgetMonth')
    expect(anchoredDateScope({ scope: 'custom', atNavigation: 4 }, 5)).toBe('budgetMonth')
  })

  it('leaves the scopes that already follow the header alone', () => {
    expect(anchoredDateScope({ scope: 'last3Months', atNavigation: 4 }, 9)).toBe('last3Months')
    expect(anchoredDateScope({ scope: 'budgetMonth', atNavigation: 4 }, 9)).toBe('budgetMonth')
  })
})
