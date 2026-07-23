import { describe, expect, it } from 'vitest'
import { detectRecurring, groupTransactions } from './recurringDetect'
import { makeTxn, monthlyDates } from './recurringTestHelpers'

describe('groupTransactions', () => {
  it('groups by normalized description, account, category, and type', () => {
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

  it('separates different categories', () => {
    const txns = [
      ...monthlyDates(2026, 1, 5, 3).map((d) =>
        makeTxn({ date: d, description: 'Glovo', categoryId: 7, amountCents: 799 }),
      ),
      ...monthlyDates(2026, 2, 10, 3).map((d) =>
        makeTxn({ date: d, description: 'Glovo', categoryId: 3, amountCents: 1500 }),
      ),
    ]
    expect(groupTransactions(txns)).toHaveLength(2)
  })

  it('excludes installment-plan payments (they are a declared schedule)', () => {
    const txns = monthlyDates(2026, 1, 5, 4).map((date) =>
      makeTxn({ date, description: 'Iphone, Cetelam', planId: 9 }),
    )
    expect(groupTransactions(txns)).toHaveLength(0)
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
    const dates = monthlyDates(2025, 12, 5, 5)
    const txns = dates.map((date) =>
      makeTxn({ date, description: 'Netflix', budgetMonth: date.slice(0, 7) }),
    )
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

  it('uses most recent amount within a group', () => {
    const dates = monthlyDates(2026, 1, 10, 4)
    const txns = dates.map((date, i) =>
      makeTxn({
        date,
        description: 'Gym',
        amountCents: i < 3 ? 3000 : 3500,
        categoryId: 5,
      }),
    )
    const suggestions = detectRecurring(txns)
    expect(suggestions[0]!.amountCents).toBe(3500)
    expect(suggestions[0]!.categoryId).toBe(5)
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

  it('dates a post-rollover monthly on its real prior-month date (Prime on the 20th)', () => {
    const txns = [
      { d: '2026-03-20', bm: '2026-04' },
      { d: '2026-04-20', bm: '2026-05' },
      { d: '2026-05-20', bm: '2026-06' },
      { d: '2026-06-20', bm: '2026-07' },
    ].map(({ d, bm }) => makeTxn({ date: d, description: 'Prime', budgetMonth: bm }))
    const august = detectRecurring(txns, { forBudgetMonth: '2026-08' })
    expect(august).toHaveLength(1)
    expect(august[0]!.description).toBe('Prime')
    expect(august[0]!.predictedBudgetMonth).toBe('2026-08')
    // Real recurrence date is 20 Jul (which rolls into the August budget), not 20 Aug.
    expect(august[0]!.predictedDate).toBe('2026-07-20')
  })

  it('suggests July when prior BM is June but last calendar date is late May', () => {
    const txns = [
      ...monthlyDates(2026, 1, 1, 4).map((date) =>
        makeTxn({ date, description: 'Carbon diet app', budgetMonth: date.slice(0, 7) }),
      ),
      makeTxn({ date: '2026-05-01', description: 'Carbon diet app', budgetMonth: '2026-05' }),
      makeTxn({ date: '2026-05-31', description: 'Carbon diet app', budgetMonth: '2026-06' }),
    ]
    const july = detectRecurring(txns, { forBudgetMonth: '2026-07' })
    expect(july).toHaveLength(1)
    expect(july[0]!.description).toBe('Carbon diet app')
    expect(july[0]!.predictedDate).toBe('2026-07-01')
    expect(july[0]!.predictedBudgetMonth).toBe('2026-07')
    expect(detectRecurring(txns, { forBudgetMonth: '2026-06' })).toHaveLength(0)
  })

  it('suggests Glovo Plus when food orders share the description', () => {
    const subRows = [
      ['2026-01-05', '2026-01'],
      ['2026-02-05', '2026-02'],
      ['2026-03-05', '2026-03'],
      ['2026-04-05', '2026-04'],
      ['2026-05-05', '2026-05'],
      ['2026-06-05', '2026-06'],
    ] as const
    const txns = [
      ...subRows.map(([date, bm]) =>
        makeTxn({ date, budgetMonth: bm, description: 'Glovo', categoryId: 7, amountCents: 799 }),
      ),
      makeTxn({ date: '2026-02-21', budgetMonth: '2026-03', description: 'Glovo', categoryId: 3, amountCents: 1381 }),
      makeTxn({ date: '2026-03-08', budgetMonth: '2026-03', description: 'Glovo', categoryId: 3, amountCents: 2018 }),
    ]
    const july = detectRecurring(txns, { forBudgetMonth: '2026-07' })
    expect(july).toHaveLength(1)
    expect(july[0]!.description).toBe('Glovo')
    expect(july[0]!.categoryId).toBe(7)
    expect(july[0]!.amountCents).toBe(799)
    expect(july[0]!.predictedDate).toBe('2026-07-05')
  })

  it('does not suppress subscription when only a food order exists in target month', () => {
    const subRows = [
      ['2026-01-05', '2026-01'],
      ['2026-02-05', '2026-02'],
      ['2026-03-05', '2026-03'],
      ['2026-04-05', '2026-04'],
      ['2026-05-05', '2026-05'],
      ['2026-06-05', '2026-06'],
    ] as const
    const txns = [
      ...subRows.map(([date, bm]) =>
        makeTxn({ date, budgetMonth: bm, description: 'Glovo', categoryId: 7, amountCents: 799 }),
      ),
      makeTxn({ date: '2026-07-10', budgetMonth: '2026-07', description: 'Glovo', categoryId: 3, amountCents: 1589 }),
    ]
    const july = detectRecurring(txns, { forBudgetMonth: '2026-07' })
    expect(july.find((s) => s.categoryId === 7)).toBeDefined()
  })
})
