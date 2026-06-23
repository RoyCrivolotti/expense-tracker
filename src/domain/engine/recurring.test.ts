import { describe, it, expect } from 'vitest'
import type { Transaction } from '../types'
import { priorBudgetMonth } from './dates'
import {
  classifyFrequency,
  detectRecurring,
  groupTransactions,
  predictNextDate,
  regularityScore,
} from './recurring'

function makeTxn(overrides: Partial<Transaction> & { date: string; description: string }): Transaction {
  const base: Transaction = {
    id: Math.random() * 10000,
    date: overrides.date,
    budgetMonth: overrides.budgetMonth ?? overrides.date.slice(0, 7),
    description: overrides.description,
    accountId: overrides.accountId ?? 1,
    categoryId: overrides.categoryId ?? 1,
    type: overrides.type ?? 'expense',
    amountCents: overrides.amountCents ?? 1500,
    cancelled: overrides.cancelled ?? false,
    status: overrides.status ?? 'posted',
  }
  if (overrides.notes != null) base.notes = overrides.notes
  return base
}

function monthlyDates(startYear: number, startMonth: number, day: number, count: number): string[] {
  const dates: string[] = []
  let y = startYear
  let m = startMonth
  for (let i = 0; i < count; i++) {
    dates.push(`${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return dates
}

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

describe('groupTransactions', () => {
  it('groups by normalized description, account, and type', () => {
    const txns = monthlyDates(2026, 1, 5, 4).map((date) =>
      makeTxn({ date, description: 'Netflix', accountId: 2 }),
    )
    const groups = groupTransactions(txns)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.dates).toHaveLength(4)
  })

  it('excludes cancelled transactions', () => {
    const txns = monthlyDates(2026, 1, 5, 4).map((date) =>
      makeTxn({ date, description: 'Netflix', cancelled: true }),
    )
    expect(groupTransactions(txns)).toHaveLength(0)
  })

  it('requires minimum 3 occurrences', () => {
    const txns = [
      makeTxn({ date: '2026-01-05', description: 'Rare' }),
      makeTxn({ date: '2026-02-05', description: 'Rare' }),
    ]
    expect(groupTransactions(txns)).toHaveLength(0)
  })

  it('separates different accounts', () => {
    const txns = [
      ...monthlyDates(2026, 1, 5, 3).map((d) => makeTxn({ date: d, description: 'X', accountId: 1 })),
      ...monthlyDates(2026, 1, 5, 3).map((d) => makeTxn({ date: d, description: 'X', accountId: 2 })),
    ]
    expect(groupTransactions(txns)).toHaveLength(2)
  })
})

describe('detectRecurring', () => {
  it('detects a monthly subscription', () => {
    const dates = monthlyDates(2025, 10, 5, 6)
    const txns = dates.map((date) =>
      makeTxn({ date, description: 'Spotify', accountId: 1, amountCents: 999 }),
    )
    const suggestions = detectRecurring(txns)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]!.frequency).toBe('monthly')
    expect(suggestions[0]!.description).toBe('Spotify')
    expect(suggestions[0]!.amountCents).toBe(999)
  })

  it('tolerates ±2 day jitter for monthly', () => {
    const dates = ['2026-01-05', '2026-02-07', '2026-03-04', '2026-04-05', '2026-05-06']
    const txns = dates.map((date) => makeTxn({ date, description: 'Rent', amountCents: 85000 }))
    const suggestions = detectRecurring(txns)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]!.frequency).toBe('monthly')
  })

  it('suppresses when predicted budget month already has a matching entry', () => {
    // 5 entries on the 5th → prediction is Jun 5 (BM: 2026-06).
    // We add a transaction whose budgetMonth = "2026-06" (the predicted BM) to test
    // suppression. We place it in the past so it doesn't shift the group's last date.
    const dates = monthlyDates(2025, 12, 5, 5)
    const txns = dates.map((date) =>
      makeTxn({ date, description: 'Netflix', budgetMonth: date.slice(0, 7) }),
    )
    // This entry is dated before the group but assigned to the predicted budget month.
    txns.push(makeTxn({ date: '2025-11-01', description: 'Netflix', budgetMonth: '2026-05' }))
    const suggestions = detectRecurring(txns)
    const netflixSuggestion = suggestions.find((s) => s.description === 'Netflix')
    expect(netflixSuggestion).toBeUndefined()
  })

  it('ignores irregular patterns', () => {
    const dates = ['2026-01-05', '2026-01-20', '2026-03-15', '2026-05-01']
    const txns = dates.map((date) => makeTxn({ date, description: 'Random' }))
    const suggestions = detectRecurring(txns)
    expect(suggestions).toHaveLength(0)
  })

  it('uses most recent amount and category', () => {
    const dates = monthlyDates(2026, 1, 10, 4)
    const txns = dates.map((date, i) =>
      makeTxn({
        date,
        description: 'Gym',
        amountCents: i < 3 ? 3000 : 3500,
        categoryId: i < 3 ? 5 : 8,
      }),
    )
    const suggestions = detectRecurring(txns)
    expect(suggestions[0]!.amountCents).toBe(3500)
    expect(suggestions[0]!.categoryId).toBe(8)
  })

  it('excludes groups missing from the prior budget month', () => {
    const txns = monthlyDates(2026, 1, 5, 5).map((date) =>
      makeTxn({ date, description: 'Psicólogo', budgetMonth: date.slice(0, 7) }),
    )
    const suggestions = detectRecurring(txns, { forBudgetMonth: '2026-07' })
    expect(suggestions.find((s) => s.description === 'Psicólogo')).toBeUndefined()
  })

  it('includes groups present in the prior budget month', () => {
    const txns = monthlyDates(2026, 3, 5, 4).map((date) =>
      makeTxn({ date, description: 'Rent', budgetMonth: date.slice(0, 7), amountCents: 85000 }),
    )
    const suggestions = detectRecurring(txns, { forBudgetMonth: '2026-07' })
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]!.description).toBe('Rent')
    expect(suggestions[0]!.predictedBudgetMonth).toBe('2026-07')
  })

  it('filters predictions to the requested budget month only', () => {
    const txns = monthlyDates(2025, 10, 5, 8).map((date) =>
      makeTxn({ date, description: 'Spotify', budgetMonth: date.slice(0, 7) }),
    )
    const july = detectRecurring(txns, { forBudgetMonth: '2026-07' })
    const august = detectRecurring(txns, { forBudgetMonth: '2026-08' })
    expect(july.every((s) => s.predictedBudgetMonth === '2026-07')).toBe(true)
    expect(august.every((s) => s.predictedBudgetMonth === '2026-08')).toBe(true)
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
