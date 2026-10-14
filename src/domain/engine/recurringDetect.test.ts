import { describe, expect, it } from 'vitest'
import {
  OVERDUE_EXPIRY_DAYS,
  PREVIOUS_MONTH_GRACE_DAYS,
  detectRecurring,
  detectUpcoming,
  groupTransactions,
  isSuggestionDue,
} from './recurringDetect'
import { addDaysIso, isDueSoon } from './dates'
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

  it('takes the amount and label of the newest occurrence whatever the row order', () => {
    const txns = [
      makeTxn({ date: '2026-03-05', description: 'Netflix', amountCents: 1_500 }),
      makeTxn({ date: '2026-01-05', description: 'netflix', amountCents: 1_000 }),
      makeTxn({ date: '2026-02-05', description: 'NETFLIX', amountCents: 1_200 }),
    ]
    const [group] = groupTransactions(txns)
    expect(group!.amountCents).toBe(1_500)
    expect(group!.label).toBe('Netflix')
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

  it('opens the window by how early the newest charges landed', () => {
    const txns = [
      makeTxn({ date: '2026-01-25', description: 'Streaming' }),
      makeTxn({ date: '2026-02-27', description: 'Streaming' }),
      makeTxn({ date: '2026-03-30', description: 'Streaming' }),
      makeTxn({ date: '2026-04-26', description: 'Streaming' }),
    ]
    const suggestions = detectRecurring(txns)
    expect(suggestions[0]!.leadDays).toBe(3)
  })

  it('gives a day of notice when every occurrence falls on the same day', () => {
    const txns = monthlyDates(2026, 1, 15, 4).map((date) =>
      makeTxn({ date, description: 'Netflix' }),
    )
    const suggestions = detectRecurring(txns)
    expect(suggestions[0]!.leadDays).toBe(1)
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

  it('excludes groups absent from both of the last two prior budget months', () => {
    // Last entry is 2026-04, requesting 2026-07: prior=2026-06, priorPrior=2026-05 — both missing.
    const txns = monthlyDates(2026, 1, 5, 4).map((date) =>
      makeTxn({ date, description: 'Psicólogo', budgetMonth: date.slice(0, 7) }),
    )
    const suggestions = detectRecurring(txns, { forBudgetMonth: '2026-07' })
    expect(suggestions.find((s) => s.description === 'Psicólogo')).toBeUndefined()
  })

  it('still suggests when the immediately prior month was skipped but the one before was present', () => {
    // Logged Jan–Aug, nothing in Sep (forgot to log it), requesting Oct.
    // priorMonth=2026-09 absent, priorPriorMonth=2026-08 present → should surface.
    const txns = monthlyDates(2026, 1, 17, 8).map((date) =>
      makeTxn({ date, description: '1Password', budgetMonth: date.slice(0, 7), amountCents: 447 }),
    )
    const suggestions = detectRecurring(txns, { forBudgetMonth: '2026-10' })
    expect(suggestions.find((s) => s.description === '1Password')).toBeDefined()
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

  it('dates a +1 rollover monthly on its real prior-month date (Prime on the 20th)', () => {
    // Paid the 20th → rolls into the next budget month, so budgetMonth = calendar + 1.
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
    // On 23 Jul it is 3 days overdue, so the due-soon window should surface it.
    expect(isDueSoon(august[0]!.predictedDate, '2026-07-23')).toBe(true)
  })

  // Real "Icon charge" data: billed ~13th and booked to the same calendar month
  // (offset 0), unlike the 20th-of-month +1 rollover case.
  const iconTxns = [
    ['2026-01-13', '2026-01'],
    ['2026-02-12', '2026-02'],
    ['2026-03-12', '2026-03'],
    ['2026-04-13', '2026-04'],
    ['2026-05-13', '2026-05'],
    ['2026-06-11', '2026-06'],
    ['2026-07-13', '2026-07'],
  ].map(([d, bm]) => makeTxn({ date: d!, description: 'Icon charge', budgetMonth: bm! }))

  it('dates an offset-0 monthly inside the viewed budget month (Icon charge ~13th)', () => {
    const august = detectRecurring(iconTxns, { forBudgetMonth: '2026-08' })
    expect(august).toHaveLength(1)
    expect(august[0]!.description).toBe('Icon charge')
    expect(august[0]!.predictedBudgetMonth).toBe('2026-08')
    // Stays in August (13 Aug), not shifted back to a already-paid 13 Jul.
    expect(august[0]!.predictedDate).toBe('2026-08-13')
    // 13 Aug is 21 days out on 23 Jul, so the due-soon window must NOT surface it yet.
    expect(isDueSoon(august[0]!.predictedDate, '2026-07-23')).toBe(false)
  })

  it('does not re-suggest an offset-0 charge already entered in the viewed month', () => {
    // July budget already has the 13 Jul charge, so no July suggestion.
    expect(detectRecurring(iconTxns, { forBudgetMonth: '2026-07' })).toHaveLength(0)
  })

  it('predicts a moved pay date from its newest occurrences, not its whole history', () => {
    // Paid on the 1st for five months, then on the 21st or 22nd (which rolls into the next budget month).
    const txns = [
      ['2026-01-01', '2026-01'],
      ['2026-02-01', '2026-02'],
      ['2026-03-01', '2026-03'],
      ['2026-04-01', '2026-04'],
      ['2026-05-01', '2026-05'],
      ['2026-05-22', '2026-06'],
      ['2026-06-21', '2026-07'],
    ].map(([date, bm]) =>
      makeTxn({ date: date!, budgetMonth: bm!, description: 'Payroll', type: 'income' }),
    )
    const [august] = detectRecurring(txns, { forBudgetMonth: '2026-08', rolloverDay: 13 })
    expect(august!.predictedDate).toBe('2026-07-21')
    expect(august!.predictedBudgetMonth).toBe('2026-08')
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

  it('applies the rollover day when a non-monthly prediction derives its budget month', () => {
    const txns = ['2023-06-20', '2024-06-20', '2025-06-20'].map((date) =>
      makeTxn({
        date,
        description: 'Domain renewal',
        budgetMonth: date.slice(0, 7),
        amountCents: 4999,
      }),
    )
    const calendar = detectRecurring(txns)
    expect(calendar).toHaveLength(1)
    expect(calendar[0]!.frequency).toBe('yearly')
    expect(calendar[0]!.predictedDate).toBe('2026-06-20')
    expect(calendar[0]!.predictedBudgetMonth).toBe('2026-06')

    // With a 13th rollover, the 20 Jun prediction counts toward the July budget.
    const rolled = detectRecurring(txns, { rolloverDay: 13 })
    expect(rolled[0]!.predictedDate).toBe('2026-06-20')
    expect(rolled[0]!.predictedBudgetMonth).toBe('2026-07')
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
  describe('when the card decides what is due', () => {
    // What the card lists: a suggestion within `leadDays` of its date, or overdue by a fortnight at most.
    function visibleOn(today: string, forBudgetMonth: string, txns: ReturnType<typeof makeTxn>[]) {
      return detectRecurring(txns, { forBudgetMonth, rolloverDay: 13 }).filter((s) =>
        isSuggestionDue(s, today, forBudgetMonth),
      )
    }

    it('keeps a charge billed on the 1st or the 31st off the card until the end of the month', () => {
      const txns = [
        ['2026-01-01', '2026-01'],
        ['2026-02-01', '2026-02'],
        ['2026-03-01', '2026-03'],
        ['2026-04-01', '2026-04'],
        ['2026-05-01', '2026-05'],
        ['2026-05-31', '2026-06'],
        ['2026-07-01', '2026-07'],
        ['2026-08-01', '2026-08'],
        ['2026-08-31', '2026-09'],
        ['2026-09-30', '2026-10'],
      ].map(([date, bm]) => makeTxn({ date: date!, budgetMonth: bm!, description: 'App subscription' }))
      expect(visibleOn('2026-10-14', '2026-11', txns)).toHaveLength(0)
      expect(visibleOn('2026-10-29', '2026-11', txns)).toHaveLength(1)
      expect(visibleOn('2026-11-01', '2026-11', txns)).toHaveLength(1)
    })

    it('does not let one early outlier row keep a steady charge on the card for weeks', () => {
      const txns = [
        makeTxn({ date: '2025-12-17', budgetMonth: '2026-01', description: 'Lessons', amountCents: 4_200 }),
        ...['2026-02-04', '2026-03-02', '2026-04-02', '2026-05-04', '2026-06-02', '2026-07-03', '2026-08-04', '2026-09-02'].map(
          (date) => makeTxn({ date, description: 'Lessons', amountCents: 4_200 }),
        ),
      ]
      expect(visibleOn('2026-09-18', '2026-10', txns)).toHaveLength(0)
      expect(visibleOn('2026-10-02', '2026-10', txns)).toHaveLength(1)
    })

    it('shows a pay date that moved near its new day and not near its old one', () => {
      const txns = [
        ['2026-01-01', '2026-01'],
        ['2026-02-01', '2026-02'],
        ['2026-03-01', '2026-03'],
        ['2026-04-01', '2026-04'],
        ['2026-05-01', '2026-05'],
        ['2026-05-22', '2026-06'],
        ['2026-06-21', '2026-07'],
        ['2026-07-21', '2026-08'],
      ].map(([date, bm]) =>
        makeTxn({ date: date!, budgetMonth: bm!, description: 'Payroll', type: 'income' }),
      )
      expect(visibleOn('2026-08-14', '2026-09', txns)).toHaveLength(0)
      expect(visibleOn('2026-08-21', '2026-09', txns)).toHaveLength(1)
    })

    it('keeps a charge that nobody logged on the card for a fortnight past its date', () => {
      const txns = monthlyDates(2026, 1, 15, 6).map((date) => makeTxn({ date, description: 'Rent' }))
      expect(visibleOn('2026-07-24', '2026-07', txns)).toHaveLength(1)
      expect(visibleOn('2026-07-30', '2026-07', txns)).toHaveLength(1)
    })

    it('drops a charge that is still not logged a fortnight past its date', () => {
      const txns = monthlyDates(2026, 1, 15, 6).map((date) => makeTxn({ date, description: 'Rent' }))
      expect(visibleOn('2026-07-31', '2026-07', txns)).toHaveLength(0)
    })
  })
})

describe('detectUpcoming', () => {
  // A charge on the 13th booked to the calendar month, logged January to September.
  const txns = monthlyDates(2026, 1, 13, 9).map((date) =>
    makeTxn({ date, description: 'Card fee', budgetMonth: date.slice(0, 7) }),
  )

  it('adds the charge of the month before that nobody has logged', () => {
    const upcoming = detectUpcoming(txns, { forBudgetMonth: '2026-11', rolloverDay: 13 })
    expect(upcoming.map((s) => [s.predictedBudgetMonth, s.predictedDate])).toEqual([
      ['2026-10', '2026-10-13'],
      ['2026-11', '2026-11-13'],
    ])
  })

  it('looks back one month and no further', () => {
    // Nothing was logged in October or November, so December itself is dropped as a quiet
    // series; November is still one month back, and October is two.
    const upcoming = detectUpcoming(txns, { forBudgetMonth: '2026-12', rolloverDay: 13 })
    expect(upcoming.map((s) => s.predictedBudgetMonth)).toEqual(['2026-11'])
  })

  it('leaves out the month before once its charge is logged', () => {
    const logged = [...txns, makeTxn({ date: '2026-10-14', description: 'Card fee', budgetMonth: '2026-10' })]
    const upcoming = detectUpcoming(logged, { forBudgetMonth: '2026-11', rolloverDay: 13 })
    expect(upcoming.map((s) => s.predictedBudgetMonth)).toEqual(['2026-11'])
  })

  it('returns what detectRecurring does for the viewed month', () => {
    const viewed = detectRecurring(txns, { forBudgetMonth: '2026-10', rolloverDay: 13 })
    const upcoming = detectUpcoming(txns, { forBudgetMonth: '2026-10', rolloverDay: 13 })
    expect(upcoming.filter((s) => s.predictedBudgetMonth === '2026-10')).toEqual(viewed)
  })

  it('orders everything by its date', () => {
    const dates = detectUpcoming(txns, { forBudgetMonth: '2026-11', rolloverDay: 13 }).map((s) => s.predictedDate)
    expect(dates).toEqual([...dates].sort())
  })
})

describe('isSuggestionDue', () => {
  const [october] = detectRecurring(
    monthlyDates(2026, 1, 13, 9).map((date) =>
      makeTxn({ date, description: 'Card fee', budgetMonth: date.slice(0, 7) }),
    ),
    { forBudgetMonth: '2026-10', rolloverDay: 13 },
  )

  it('is due on its date and the day before, not a week before', () => {
    expect(isSuggestionDue(october!, '2026-10-12', '2026-10')).toBe(true)
    expect(isSuggestionDue(october!, '2026-10-05', '2026-10')).toBe(false)
  })

  it('stays due for a fortnight past its date while its month is on screen, then not', () => {
    const lastDay = addDaysIso('2026-10-13', OVERDUE_EXPIRY_DAYS)
    expect(isSuggestionDue(october!, lastDay, '2026-10')).toBe(true)
    expect(isSuggestionDue(october!, addDaysIso(lastDay, 1), '2026-10')).toBe(false)
  })

  it('is due for a week after its date when the next month is on screen, then not', () => {
    const lastDay = addDaysIso('2026-10-13', PREVIOUS_MONTH_GRACE_DAYS)
    expect(isSuggestionDue(october!, lastDay, '2026-11')).toBe(true)
    expect(isSuggestionDue(october!, addDaysIso(lastDay, 1), '2026-11')).toBe(false)
  })
})

describe('a charge that is already logged for its cycle', () => {
  // Paid on the 15th and booked to the calendar month, then the last one booked elsewhere.
  const earlier = monthlyDates(2026, 2, 15, 7).map((date) =>
    makeTxn({ date, description: 'Licence', budgetMonth: date.slice(0, 7) }),
  )
  const withLast = (date: string, budgetMonth: string) => [
    ...earlier,
    makeTxn({ date, description: 'Licence', budgetMonth }),
  ]

  it('does not come back for last month when the charge was paid a few days late', () => {
    // Rent on the 29th; 29 Nov 2025 was a Saturday, so it was paid on Monday 1 Dec.
    const rent = ['2025-07-29', '2025-08-29', '2025-09-29', '2025-10-29', '2025-12-01'].map((date) =>
      makeTxn({ date, description: 'Rent', budgetMonth: date.slice(0, 7) }),
    )
    expect(detectUpcoming(rent, { forBudgetMonth: '2025-12' })).toEqual([])
  })

  it('does not come back when the charge was booked to the next budget month', () => {
    const txns = withLast('2026-09-15', '2026-10')
    expect(detectUpcoming(txns, { forBudgetMonth: '2026-10', rolloverDay: 13 })).toEqual([])
  })

  it('counts a charge logged a day before its predicted date as that cycle', () => {
    const txns = withLast('2026-09-14', '2026-10')
    expect(detectUpcoming(txns, { forBudgetMonth: '2026-10', rolloverDay: 13 })).toEqual([])
  })

  it('counts a charge logged up to five days early, and not six, as that cycle', () => {
    const fiveEarly = detectUpcoming(withLast('2026-09-10', '2026-10'), { forBudgetMonth: '2026-10', rolloverDay: 13 })
    expect(fiveEarly).toEqual([])
    const sixEarly = detectUpcoming(withLast('2026-09-09', '2026-10'), { forBudgetMonth: '2026-10', rolloverDay: 13 })
    expect(sixEarly.map((s) => [s.predictedBudgetMonth, s.predictedDate])).toEqual([['2026-09', '2026-09-15']])
  })

  it('still suggests the charge that has not been logged yet', () => {
    const txns = withLast('2026-08-15', '2026-08')
    const upcoming = detectUpcoming(txns, { forBudgetMonth: '2026-09', rolloverDay: 13 })
    expect(upcoming.map((s) => [s.predictedBudgetMonth, s.predictedDate])).toEqual([['2026-09', '2026-09-15']])
  })
})
