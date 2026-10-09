import { describe, expect, it } from 'vitest'
import { addDaysIso, dateAtYears, yearsBetween } from './dates'
import { dateAtOffset, nominalToReal, realToNominal, yearOffsetFromDate } from './wealthTracking'

describe('yearsBetween and dateAtYears', () => {
  it('count a whole number of years on each anniversary, exactly', () => {
    for (let n = 0; n <= 30; n++) {
      const date = `${2026 + n}-01-01`
      expect(yearsBetween('2026-01-01', date)).toBe(n)
      expect(dateAtYears('2026-01-01', n)).toBe(date)
    }
  })

  it('count a leap day as a day of the year, not a different length of year', () => {
    // 2028 has 366 days, so half way through it is not the 1st of July.
    expect(yearsBetween('2028-01-01', '2028-07-01')).toBeCloseTo(182 / 366, 10)
    expect(dateAtYears('2028-01-01', 182 / 366)).toBe('2028-07-01')
  })

  it('take a start on 29 February to 1 March in the years that have none', () => {
    expect(dateAtYears('2028-02-29', 1)).toBe('2029-03-01')
    expect(yearsBetween('2028-02-29', '2029-03-01')).toBe(1)
    expect(dateAtYears('2028-02-29', 4)).toBe('2032-02-29')
    expect(yearsBetween('2028-02-29', '2032-02-29')).toBe(4)
  })

  it.each(['2026-01-01', '2026-10-09', '2028-02-29', '2026-01-31', '2027-03-31', '2026-12-31'])(
    'give back every day from a start on %s',
    (start) => {
      for (let d = 0; d <= 40 * 366; d += 1) {
        const day = addDaysIso(start, d)
        expect(dateAtYears(start, yearsBetween(start, day))).toBe(day)
      }
    },
  )

  it('read the same day as the start for no years', () => {
    expect(dateAtYears('2026-10-09', 0)).toBe('2026-10-09')
  })
})

describe('the plan axis', () => {
  it('puts a check-in on the plan\u2019s anniversary at a whole number of years', () => {
    // A year of 365,25 days put the fifth anniversary 0,7 of a day short of 5, so a check-in on the
    // day a house payment lands was measured against the line just before the step.
    expect(yearOffsetFromDate('2026-01-01', '2031-01-01')).toBe(5)
    expect(yearOffsetFromDate('2026-10-09', '2034-10-09')).toBe(8)
  })

  it('names the anniversary for a whole number of years', () => {
    expect(dateAtOffset('2026-01-01', 3)).toBe('2029-01-01')
    expect(dateAtOffset('2026-10-09', 8)).toBe('2034-10-09')
  })

  it('brings a balance back by exactly the inflation of the whole years between', () => {
    const real = nominalToReal(10_000_000, '2026-01-01', '2031-01-01', 0.02)
    expect(real).toBe(Math.round(10_000_000 / 1.02 ** 5))
    expect(realToNominal(real, '2026-01-01', '2031-01-01', 0.02)).toBeCloseTo(10_000_000, -1)
  })

  it('has no offset for a date that is not one', () => {
    expect(yearOffsetFromDate('2026-01-01', 'soon')).toBeNull()
    expect(yearOffsetFromDate('', '2031-01-01')).toBeNull()
  })

  it('has no offset for a date that looks like one but is not on the calendar', () => {
    // These would roll over into some other day and give a number that is wrong without looking it.
    expect(yearOffsetFromDate('2026-01-01', '2026-13-45')).toBeNull()
    expect(yearOffsetFromDate('2026-02-30', '2027-01-01')).toBeNull()
    expect(yearOffsetFromDate('2026-01-01', '2027-02-29')).toBeNull()
    expect(yearOffsetFromDate('2028-02-29', '2029-03-01')).toBe(1)
  })
})
