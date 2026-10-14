import { describe, expect, it } from 'vitest'
import { addDaysIso } from './dates'
import {
  canonicalDayOfMonth,
  chooseRhythm,
  classifyFrequency,
  dateByInterval,
  leadDays,
  predictDateInBudgetMonth,
  predictNextDate,
  regularityScore,
  typicalGap,
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

describe('canonicalDayOfMonth', () => {
  it('uses median day with weekend jitter', () => {
    const dates = ['2026-01-01', '2026-02-02', '2026-03-03', '2026-04-02', '2026-05-01']
    expect(canonicalDayOfMonth(dates)).toBe(2)
  })

  it('follows the newest occurrences once the billing day has moved', () => {
    const dates = [
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
      '2026-05-22',
      '2026-06-21',
    ]
    expect(canonicalDayOfMonth(dates)).toBe(21)
  })

  it('takes all of them when there are fewer than the history it reads', () => {
    expect(canonicalDayOfMonth(['2026-01-10', '2026-02-12'])).toBe(11)
  })
})

describe('predictDateInBudgetMonth', () => {
  it('keeps the date in the budget month itself when offset is 0', () => {
    const dates = ['2026-01-01', '2026-02-02', '2026-03-03', '2026-04-02', '2026-05-01']
    expect(predictDateInBudgetMonth('2026-07', dates, 0)).toBe('2026-07-02')
  })

  it('keeps a near-rollover day in-month when the group offset is 0 (deferred-card charge)', () => {
    // Icon charge bills ~13th and is booked to the same calendar month (offset 0).
    const dates = ['2026-05-13', '2026-06-11', '2026-07-13']
    expect(predictDateInBudgetMonth('2026-08', dates, 0)).toBe('2026-08-13')
  })

  it('puts a +1 rollover charge in the prior calendar month (paid the 20th)', () => {
    // Prime billed the 20th rolls into next budget month (offset +1).
    const dates = ['2026-05-20', '2026-06-20', '2026-07-20']
    expect(predictDateInBudgetMonth('2026-08', dates, 1)).toBe('2026-07-20')
  })

  it('puts a -1 deferred charge in the following calendar month', () => {
    // A June budget charge that settles the following month (15 Jul).
    const dates = ['2026-04-15', '2026-05-15', '2026-06-15']
    expect(predictDateInBudgetMonth('2026-06', dates, -1)).toBe('2026-07-15')
  })

  it('clamps the canonical day to the resolved calendar month length', () => {
    const dates = ['2026-01-31', '2026-03-31', '2026-05-31']
    expect(predictDateInBudgetMonth('2026-03', dates, 1)).toBe('2026-02-28')
  })
})

describe('predictNextDate', () => {
  it('predicts monthly using median day-of-month', () => {
    const dates = ['2026-01-05', '2026-02-05', '2026-03-05', '2026-04-07']
    const result = predictNextDate('monthly', dates)
    expect(result).toBe('2026-05-05')
  })
  it('clamps to month end for short months', () => {
    const dates = ['2025-11-30', '2025-12-30', '2026-01-30']
    const result = predictNextDate('monthly', dates)
    expect(result).toBe('2026-02-28')
  })
  it('predicts weekly by adding 7 days', () => {
    const dates = ['2026-06-01', '2026-06-08', '2026-06-15']
    expect(predictNextDate('weekly', dates)).toBe('2026-06-22')
  })
  it('predicts quarterly by adding 3 months', () => {
    const dates = ['2026-01-15', '2026-04-15', '2026-07-15']
    expect(predictNextDate('quarterly', dates)).toBe('2026-10-15')
  })
  it('predicts yearly by adding 12 months', () => {
    const dates = ['2024-03-10', '2025-03-10', '2026-03-10']
    expect(predictNextDate('yearly', dates)).toBe('2027-03-10')
  })

  it('predicts weekly correctly across a US DST spring-forward boundary', () => {
    // A UTC-parse + local-mutate + UTC-format implementation of "add 7 days"
    // silently loses a day here (regression test for that bug — see dates.ts's
    // addDaysIso, which this now delegates to).
    const originalTz = process.env.TZ
    process.env.TZ = 'America/Los_Angeles'
    try {
      const dates = ['2026-02-16', '2026-02-23', '2026-03-02']
      expect(predictNextDate('weekly', dates)).toBe('2026-03-09')
    } finally {
      process.env.TZ = originalTz
    }
  })
})

describe('leadDays', () => {
  it('is a day when the series always lands on the same day', () => {
    expect(leadDays('monthly', ['2026-03-15', '2026-04-15', '2026-05-15', '2026-06-15'])).toBe(1)
  })

  it('adds how early the newest charges landed before the usual day', () => {
    // Usual day is the 27th; the 25th is two days early.
    const dates = ['2026-01-28', '2026-02-27', '2026-03-25', '2026-04-29', '2026-05-27']
    expect(leadDays('monthly', dates)).toBe(3)
  })

  it('counts the 31st and the 1st as a day apart, not thirty', () => {
    const dates = ['2026-05-01', '2026-05-31', '2026-07-01', '2026-08-01', '2026-08-31']
    expect(leadDays('monthly', dates)).toBe(2)
  })

  it('does not call a short month early when the day is clamped to its end', () => {
    const dates = ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']
    expect(leadDays('monthly', dates)).toBe(1)
  })

  it('ignores charges older than the history it reads', () => {
    const dates = ['2025-12-15', '2026-01-02', '2026-02-02', '2026-03-02', '2026-04-02', '2026-05-02']
    expect(leadDays('monthly', dates)).toBe(1)
  })

  it('stops adding days at the cap however early one charge landed', () => {
    const dates = ['2026-01-10', '2026-02-20', '2026-03-20', '2026-04-20', '2026-05-20']
    expect(leadDays('monthly', dates)).toBe(5)
  })

  it('gives weekly, quarterly and yearly series a day of notice, however their gaps vary', () => {
    expect(leadDays('weekly', ['2026-06-05', '2026-06-12', '2026-06-18', '2026-06-25', '2026-07-03'])).toBe(1)
    expect(leadDays('quarterly', ['2025-01-10', '2025-04-10', '2025-07-10', '2025-10-10'])).toBe(1)
    expect(leadDays('yearly', ['2023-06-20', '2024-06-20', '2025-06-20'])).toBe(1)
  })

})

function everyDays(start: string, gap: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDaysIso(start, gap * i))
}

describe('typicalGap and dateByInterval', () => {
  it('uses the median of the newest three gaps', () => {
    // Gaps 40, 30, 35, 35: the newest three are 30, 35, 35.
    const dates = ['2026-01-01', '2026-02-10', '2026-03-12', '2026-04-16', '2026-05-21']
    expect(typicalGap(dates)).toBe(35)
    expect(dateByInterval(dates)).toBe('2026-06-25')
    expect(dateByInterval(dates, 2)).toBe('2026-07-30')
  })

  it('is zero for a single date rather than NaN', () => {
    expect(typicalGap(['2026-01-01'])).toBe(0)
  })

  it('counts days across a US daylight-saving change', () => {
    const originalTz = process.env.TZ
    process.env.TZ = 'America/Los_Angeles'
    try {
      expect(dateByInterval(['2026-02-14', '2026-03-14', '2026-04-11'])).toBe('2026-05-09')
    } finally {
      process.env.TZ = originalTz
    }
  })
})

describe('chooseRhythm', () => {
  it('keeps the day of the month for a steady day', () => {
    const dates = ['2025-10-15', '2025-11-15', '2025-12-15', '2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15']
    expect(chooseRhythm(dates)).toBe('calendar')
  })

  it.each([
    ['every four weeks', 28],
    ['every five weeks', 35],
  ])('picks the interval for a charge %s', (_label, gap) => {
    expect(chooseRhythm(everyDays('2025-10-03', gap, 8))).toBe('interval')
  })

  it('keeps the day of the month with fewer than six occurrences, however it drifts', () => {
    expect(chooseRhythm(everyDays('2025-10-03', 35, 5))).toBe('calendar')
  })

  it('keeps the day of the month for the first Friday of the month', () => {
    const dates = ['2025-10-03', '2025-11-07', '2025-12-05', '2026-01-02', '2026-02-06', '2026-03-06', '2026-04-03']
    expect(chooseRhythm(dates)).toBe('calendar')
  })

  it('keeps the day of the month through a day or two of jitter', () => {
    const dates = ['2025-10-10', '2025-11-12', '2025-12-09', '2026-01-10', '2026-02-11', '2026-03-09', '2026-04-10']
    expect(chooseRhythm(dates)).toBe('calendar')
  })

  it('keeps the day of the month when one charge was a week late', () => {
    const dates = ['2025-10-15', '2025-11-15', '2025-12-15', '2026-01-22', '2026-02-15', '2026-03-15', '2026-04-15']
    expect(chooseRhythm(dates)).toBe('calendar')
  })

  it('follows a series that changes from a calendar day to an interval', () => {
    const calendar = ['2025-05-15', '2025-06-15', '2025-07-15', '2025-08-15']
    const interval = everyDays('2025-09-12', 35, 6)
    expect(chooseRhythm([...calendar, ...interval])).toBe('interval')
  })
})

describe('leadDays for an interval series', () => {
  it('adds how much sooner than the typical gap the newest charges followed one another', () => {
    // Typical gap 35; one charge came 33 days after the one before it.
    const dates = ['2026-01-01', '2026-02-05', '2026-03-12', '2026-04-14', '2026-05-19']
    expect(leadDays('monthly', dates, 'interval')).toBe(3)
  })

  it('is a day when every gap is the same', () => {
    expect(leadDays('monthly', everyDays('2026-01-01', 35, 6), 'interval')).toBe(1)
  })
})
