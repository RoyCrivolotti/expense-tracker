import { describe, expect, it } from 'vitest'
import {
  canonicalDayOfMonth,
  classifyFrequency,
  predictDateInBudgetMonth,
  predictNextDate,
  regularityScore,
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
})
