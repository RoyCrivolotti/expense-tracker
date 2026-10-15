import { describe, expect, it } from 'vitest'
import {
  classifyFrequency,
  leadFromHistory,
  median,
  regularityScore,
  usualDate,
  usualDay,
} from './recurringPredict'

describe('classifyFrequency', () => {
  it('detects weekly', () => expect(classifyFrequency(7)).toBe('weekly'))
  it('detects monthly', () => expect(classifyFrequency(30)).toBe('monthly'))
  it('detects quarterly', () => expect(classifyFrequency(91)).toBe('quarterly'))
  it('detects yearly', () => expect(classifyFrequency(365)).toBe('yearly'))
  it('returns null for irregular gaps', () => expect(classifyFrequency(15)).toBeNull())
  it('handles edge of monthly range', () => {
    expect(classifyFrequency(25)).toBe('monthly')
    expect(classifyFrequency(37)).toBe('monthly')
  })
  it('leaves a gap just outside each bucket unclassified', () => {
    expect(classifyFrequency(4)).toBeNull()
    expect(classifyFrequency(10)).toBeNull()
    expect(classifyFrequency(24)).toBeNull()
    expect(classifyFrequency(38)).toBeNull()
    expect(classifyFrequency(79)).toBeNull()
    expect(classifyFrequency(106)).toBeNull()
    expect(classifyFrequency(339)).toBeNull()
    expect(classifyFrequency(396)).toBeNull()
  })
})

describe('regularityScore', () => {
  it('returns 1 for perfectly regular gaps', () => {
    expect(regularityScore([30, 30, 30, 30])).toBe(1)
  })
  it('returns high score when most gaps within tolerance', () => {
    const score = regularityScore([30, 31, 29, 30, 32])
    expect(score).toBeGreaterThanOrEqual(0.8)
  })
  it('returns low score for irregular gaps', () => {
    const score = regularityScore([10, 45, 30, 60, 5])
    expect(score).toBeLessThan(0.6)
  })
  it('returns 0 for empty array', () => {
    expect(regularityScore([])).toBe(0)
  })
})

describe('median', () => {
  it('takes the middle of an odd count and the mean of the middle two of an even count', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 9])).toBe(3)
  })
})

describe('usualDay', () => {
  it('uses the middle of the newest charges, so weekend drift does not move it', () => {
    const dates = ['2026-01-01', '2026-02-02', '2026-03-03', '2026-04-02', '2026-05-01']
    expect(usualDate('2026-06', usualDay(dates))).toBe('2026-06-02')
  })

  it('follows the newest charges once the billing day has moved', () => {
    const moved = ['2026-03-01', '2026-04-01', '2026-05-01', '2026-06-21', '2026-07-21', '2026-08-21']
    expect(usualDate('2026-09', usualDay(moved))).toBe('2026-09-21')
  })

  it('follows a billing day that has moved after two charges on the new day', () => {
    const dates = ['2026-04-01', '2026-05-01', '2026-06-21', '2026-07-21']
    expect(usualDate('2026-08', usualDay(dates))).toBe('2026-08-21')
  })

  it('takes all of them when there are fewer than the history it reads', () => {
    expect(usualDate('2026-03', usualDay(['2026-01-10', '2026-02-12']))).toBe('2026-03-11')
  })

  it('treats the 30th and the 1st as two days apart, not twenty-nine', () => {
    // Around the turn of the month, not the 27th that a median of the days 30, 27 and 1 gives.
    const dates = ['2026-01-30', '2026-02-27', '2026-04-01']
    expect(usualDate('2026-05', usualDay(dates))).toBe('2026-05-30')
  })

  it('is not pulled half a month by one odd charge in the middle of the month', () => {
    expect(usualDate('2026-07', usualDay(['2026-05-05', '2026-06-05', '2026-06-20']))).toBe('2026-07-05')
    expect(usualDate('2026-07', usualDay(['2026-05-05', '2026-05-20', '2026-06-05']))).toBe('2026-07-05')
  })

  it('keeps a charge billed on the last day of the month on the last day of every month', () => {
    const dates = ['2026-01-31', '2026-02-28', '2026-03-31']
    const usual = usualDay(dates)
    expect(usualDate('2026-04', usual)).toBe('2026-04-30')
    expect(usualDate('2026-05', usual)).toBe('2026-05-31')
    expect(usualDate('2027-02', usual)).toBe('2027-02-28')
  })

  it('does not depend on the order of the dates beyond them being oldest to newest', () => {
    const usual = usualDay(['2026-01-14', '2026-02-15', '2026-03-17'])
    expect(usualDate('2026-04', usual)).toBe('2026-04-15')
  })
})

describe('usualDate', () => {
  it('can fall in the month before the one asked for, for a charge a little before the 1st', () => {
    expect(usualDate('2026-01', { anchor: 1, shift: -2 })).toBe('2025-12-30')
  })

  it('is a calendar day under a time zone that skips an hour that month', () => {
    // A local-time implementation of "add days" can lose a day across a spring-forward change.
    const originalTz = process.env.TZ
    process.env.TZ = 'America/Los_Angeles'
    try {
      expect(usualDate('2026-03', { anchor: 8, shift: 2 })).toBe('2026-03-10')
      expect(usualDate('2026-03', { anchor: 6, shift: 3 })).toBe('2026-03-09')
    } finally {
      if (originalTz === undefined) delete process.env.TZ
      else process.env.TZ = originalTz
    }
  })
})

describe('leadFromHistory', () => {
  const lead = (dates: string[]) => leadFromHistory(dates, usualDay(dates))

  it('is a day when the series always lands on the same day', () => {
    expect(lead(['2026-03-15', '2026-04-15', '2026-05-15', '2026-06-15'])).toBe(1)
  })

  it('adds how early the newest charges landed before the usual day', () => {
    // Usual day is the 27th; the 25th is two days early.
    expect(lead(['2026-01-28', '2026-02-27', '2026-03-25', '2026-04-29', '2026-05-27'])).toBe(3)
  })

  it('counts the 31st and the 1st as a day apart, not thirty', () => {
    expect(lead(['2026-05-01', '2026-05-31', '2026-07-01', '2026-08-01', '2026-08-31'])).toBe(2)
  })

  it('does not call a short month early when the day is clamped to its end', () => {
    expect(lead(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])).toBe(1)
  })

  it('ignores an early charge older than the history it reads', () => {
    // 27 Dec is six days before the usual 2nd; it is the sixth newest, so it does not count.
    expect(lead(['2025-12-27', '2026-01-02', '2026-02-02', '2026-03-02', '2026-04-02', '2026-05-02'])).toBe(1)
  })

  it('counts a charge on the 1st as a day after a usual day of the 31st, not thirty days before it', () => {
    expect(lead(['2026-05-31', '2026-07-01', '2026-07-31', '2026-08-31'])).toBe(1)
  })

  it('stops adding days at the cap however early one charge landed', () => {
    expect(lead(['2026-01-10', '2026-02-20', '2026-03-20', '2026-04-20', '2026-05-20'])).toBe(5)
  })
})
