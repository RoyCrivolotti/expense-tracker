import { describe, expect, it } from 'vitest'
import { detectRecurring, groupTransactions } from './recurringDetect'
import { addDaysIso, defaultBudgetMonth, isDueSoon } from './dates'
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
  describe('a charge that repeats a fixed number of days apart', () => {
    /** `count` charges `gap` days apart, the last on `end`, booked by the rollover rule unless told otherwise. */
    function everyDaysEnding(end: string, gap: number, count: number, rolloverDay = 1) {
      return Array.from({ length: count }, (_, i) => addDaysIso(end, -gap * (count - 1 - i))).map((date) =>
        makeTxn({ date, budgetMonth: defaultBudgetMonth(date, rolloverDay), description: 'Top-up' }),
      )
    }

    it('predicts the next charge the typical gap after the last, not on its day of the month', () => {
      // Every 35 days; the last was 5 Jun 2026, so the next is 10 Jul.
      const txns = everyDaysEnding('2026-06-05', 35, 8)
      const [july] = detectRecurring(txns, { forBudgetMonth: '2026-07' })
      expect(july!.predictedDate).toBe('2026-07-10')
      expect(july!.predictedBudgetMonth).toBe('2026-07')
    })

    it('has no suggestion for a month the series skips', () => {
      // Every 35 days, the last on 27 Nov 2026: the next are 1 Jan and 5 Feb, so nothing lands in December.
      const txns = everyDaysEnding('2026-11-27', 35, 8)
      expect(detectRecurring(txns, { forBudgetMonth: '2026-12' })).toHaveLength(0)
      const [january] = detectRecurring(txns, { forBudgetMonth: '2027-01' })
      expect(january!.predictedDate).toBe('2027-01-01')
    })

    it('suggests a second charge in the same month when the series repeats every four weeks', () => {
      // 3 Oct 2026 is followed 28 days later by 31 Oct, in the same October budget month.
      const txns = everyDaysEnding('2026-10-03', 28, 8)
      const [october] = detectRecurring(txns, { forBudgetMonth: '2026-10' })
      expect(october!.predictedDate).toBe('2026-10-31')
    })

    it('stops suggesting it once the charge is entered, however far from the predicted day', () => {
      const txns = everyDaysEnding('2026-06-05', 35, 8)
      txns.push(makeTxn({ date: '2026-07-04', budgetMonth: '2026-07', description: 'Top-up' }))
      expect(detectRecurring(txns, { forBudgetMonth: '2026-07' })).toHaveLength(0)
    })

    it('puts a charge in the budget month the rollover day gives its date, as the series was booked', () => {
      // With a 13th rollover, 14 Aug 2026 counts toward September and 18 Sep toward October.
      const txns = everyDaysEnding('2026-07-10', 35, 8, 13)
      const [september] = detectRecurring(txns, { forBudgetMonth: '2026-09', rolloverDay: 13 })
      expect(september!.predictedDate).toBe('2026-08-14')
      expect(september!.predictedBudgetMonth).toBe('2026-09')
    })

    it('keeps the series own offset when it was not booked by the rollover rule', () => {
      // The newest charge, on 14 Aug, is booked to August although the 13th rolls it into September.
      const txns = everyDaysEnding('2026-08-14', 35, 8, 13).map((t, i, all) =>
        i === all.length - 1 ? { ...t, budgetMonth: '2026-08' } : t,
      )
      const [september] = detectRecurring(txns, { forBudgetMonth: '2026-09', rolloverDay: 13 })
      expect(september!.predictedDate).toBe('2026-09-18')
      expect(september!.predictedBudgetMonth).toBe('2026-09')
    })

    it('shows it a day before the predicted date and not a week before', () => {
      const txns = everyDaysEnding('2026-06-05', 35, 8)
      const [july] = detectRecurring(txns, { forBudgetMonth: '2026-07' })
      expect(isDueSoon(july!.predictedDate, '2026-07-09', july!.leadDays)).toBe(true)
      expect(isDueSoon(july!.predictedDate, '2026-07-03', july!.leadDays)).toBe(false)
    })

    it('keeps predicting from the day of the month with fewer than six charges', () => {
      // Five charges every 35 days, the last on 20 Feb: the day of the month (the 16th) is used, not 27 Mar.
      const txns = everyDaysEnding('2026-02-20', 35, 5)
      const [march] = detectRecurring(txns, { forBudgetMonth: '2026-03' })
      expect(march!.predictedDate).toBe('2026-03-16')
    })

    it('leaves a steady day of the month on the calendar', () => {
      const txns = monthlyDates(2025, 10, 15, 8).map((date) => makeTxn({ date, description: 'Rent' }))
      const [prediction] = detectRecurring(txns, { forBudgetMonth: '2026-06' })
      expect(prediction!.predictedDate).toBe('2026-06-15')
    })
  })

  describe('when the card decides what is due', () => {
    // The card shows a suggestion when its predicted date is at most `leadDays` away (or past).
    function visibleOn(today: string, forBudgetMonth: string, txns: ReturnType<typeof makeTxn>[]) {
      return detectRecurring(txns, { forBudgetMonth, rolloverDay: 13 }).filter((s) =>
        isDueSoon(s.predictedDate, today, s.leadDays),
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

    it('keeps a charge that nobody logged on the card past its date', () => {
      const txns = monthlyDates(2026, 1, 15, 6).map((date) => makeTxn({ date, description: 'Rent' }))
      expect(visibleOn('2026-07-24', '2026-07', txns)).toHaveLength(1)
    })
  })
})
