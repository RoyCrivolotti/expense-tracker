import { describe, expect, it } from 'vitest'
import type { Transaction } from '../types'
import { addDaysIso } from './dates'
import { detectUpcoming } from './recurringUpcoming'
import { makeTxn, monthlyDates } from './recurringTestHelpers'

let nextId = 1
function row(date: string, overrides: Partial<Transaction> = {}): Transaction {
  return makeTxn({ id: nextId++, date, description: 'Gym', ...overrides })
}

/** Gym, billed on the 5th from January to June 2026; the next charge is 5 July. */
function gymOnThe5th(extra: Transaction[] = []): Transaction[] {
  return [...monthlyDates(2026, 1, 5, 6).map((date) => row(date)), ...extra]
}

function upcoming(rows: Transaction[], today: string) {
  return detectUpcoming(rows, { today })
}

function datesOf(rows: Transaction[], today: string): string[] {
  return upcoming(rows, today).map((s) => s.predictedDate)
}

/** The mornings, counting from the day after the newest row, on which the card lists anything. */
function mornings(rows: Transaction[], count: number): string[] {
  const newest = rows.map((r) => r.date).sort().pop()!
  return Array.from({ length: count }, (_, i) => addDaysIso(newest, i + 1)).filter(
    (today) => upcoming(rows, today).length > 0,
  )
}

/** A series whose charges are `gaps` days apart, starting on `start`. */
function withGaps(start: string, gaps: number[]): Transaction[] {
  const dates = [start]
  for (const gap of gaps) dates.push(addDaysIso(dates[dates.length - 1]!, gap))
  return dates.map((date) => row(date))
}

describe('detectUpcoming', () => {
  describe('what it suggests', () => {
    it('suggests the next charge of a monthly series on its usual day', () => {
      const rows = monthlyDates(2026, 1, 5, 6).map((date, i) =>
        row(date, { amountCents: 1_000 + i, categoryId: 4, accountId: 2 }),
      )
      expect(upcoming(rows, '2026-07-05')).toEqual([
        {
          description: 'Gym',
          type: 'expense',
          accountId: 2,
          categoryId: 4,
          amountCents: 1_005,
          predictedDate: '2026-07-05',
          predictedBudgetMonth: '2026-07',
          leadDays: 1,
        },
      ])
    })

    it('speaks for the newest charge: its label and its amount', () => {
      const rows = [
        row('2026-04-05', { description: 'gym', amountCents: 900 }),
        row('2026-05-05', { description: 'GYM', amountCents: 950 }),
        row('2026-06-05', { description: 'Gym ', amountCents: 1_200 }),
      ]
      const [suggestion] = upcoming(rows, '2026-07-05')
      expect(suggestion).toMatchObject({ description: 'Gym ', amountCents: 1_200 })
    })

    it('keeps an income series an income', () => {
      const rows = monthlyDates(2026, 1, 25, 6).map((date) => row(date, { description: 'Payroll', type: 'income' }))
      expect(upcoming(rows, '2026-07-25')).toMatchObject([{ description: 'Payroll', type: 'income' }])
    })

    it('lists the same text on two accounts as two series', () => {
      const rows = [
        ...monthlyDates(2026, 1, 5, 6).map((date) => row(date, { accountId: 1 })),
        ...monthlyDates(2026, 1, 5, 6).map((date) => row(date, { accountId: 2 })),
      ]
      expect(upcoming(rows, '2026-07-05').map((s) => s.accountId)).toEqual([1, 2])
    })

    it('lists series due the same day in a fixed order, whatever order the rows arrive in', () => {
      const beta = monthlyDates(2026, 1, 5, 6).map((date) => row(date, { description: 'Beta' }))
      const alpha = monthlyDates(2026, 1, 5, 6).map((date) => row(date, { description: 'Alpha' }))
      const earlier = monthlyDates(2026, 1, 4, 6).map((date) => row(date, { description: 'Zeta' }))
      const rows = [...beta, ...alpha, ...earlier]
      const expected = ['Zeta', 'Alpha', 'Beta']
      expect(upcoming(rows, '2026-07-05').map((s) => s.description)).toEqual(expected)
      expect(upcoming([...rows].reverse(), '2026-07-05').map((s) => s.description)).toEqual(expected)
    })

    it('gives the same answer for rows newest first, which is the order the server sends them', () => {
      const rows = gymOnThe5th()
      expect(upcoming([...rows].reverse(), '2026-07-05')).toEqual(upcoming(rows, '2026-07-05'))
      expect(upcoming([...rows].reverse(), '2026-07-05')).toHaveLength(1)
    })

    it('does not look at which budget month is open, only at the dates', () => {
      // Nothing about the call names a month: a charge is on the card on the days it is due.
      expect(datesOf(gymOnThe5th(), '2026-07-05')).toEqual(['2026-07-05'])
    })
  })

  describe('which series count', () => {
    it('needs three charges', () => {
      expect(upcoming([row('2026-05-05'), row('2026-06-05')], '2026-07-05')).toEqual([])
    })

    it('ignores cancelled charges and installment-plan payments', () => {
      const cancelled = monthlyDates(2026, 1, 5, 6).map((date) => row(date, { cancelled: true }))
      const planned = monthlyDates(2026, 1, 5, 6).map((date) => row(date, { planId: 9 }))
      expect(upcoming([...cancelled, ...planned], '2026-07-05')).toEqual([])
    })

    it('ignores charges without a regular rhythm', () => {
      const rows = ['2026-01-05', '2026-01-20', '2026-03-15', '2026-05-01', '2026-06-04'].map((date) => row(date))
      expect(upcoming(rows, '2026-07-05')).toEqual([])
    })

    it('tolerates a few days either side of the usual day', () => {
      const rows = ['2026-01-05', '2026-02-07', '2026-03-04', '2026-04-05', '2026-05-06', '2026-06-05'].map((d) => row(d))
      expect(datesOf(rows, '2026-07-05')).toEqual(['2026-07-05'])
    })

    it('suggests monthly series only: weekly, quarterly and yearly ones never reach the card', () => {
      const weekly = ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29'].map((d) => row(d, { description: 'Weekly' }))
      const quarterly = ['2025-01-10', '2025-04-10', '2025-07-10', '2025-10-10'].map((d) => row(d, { description: 'Quarterly' }))
      const yearly = ['2023-06-20', '2024-06-20', '2025-06-20'].map((d) => row(d, { description: 'Yearly' }))
      expect(mornings(weekly, 120)).toEqual([])
      expect(mornings(quarterly, 400)).toEqual([])
      expect(mornings(yearly, 800)).toEqual([])
    })

    it('needs a regular rhythm: a scattered series never reaches the card', () => {
      // Monthly by its median gap, but only two of its five gaps are near it.
      expect(mornings(withGaps('2026-01-01', [10, 45, 31, 20, 29]), 90)).toEqual([])
    })

    it('needs three in five gaps near the median, and not two in four', () => {
      expect(mornings(withGaps('2026-01-01', [30, 30, 30, 10, 50]), 60)).not.toEqual([])
      expect(mornings(withGaps('2026-01-01', [30, 30, 10, 50]), 60)).toEqual([])
    })

  })

  describe('when it shows a charge', () => {
    it('opens the day before the usual day', () => {
      expect(datesOf(gymOnThe5th(), '2026-07-03')).toEqual([])
      expect(datesOf(gymOnThe5th(), '2026-07-04')).toEqual(['2026-07-05'])
    })

    it('keeps an unlogged charge for a week after its date and then lets it go', () => {
      expect(datesOf(gymOnThe5th(), '2026-07-12')).toEqual(['2026-07-05'])
      expect(datesOf(gymOnThe5th(), '2026-07-13')).toEqual([])
    })

    it('opens earlier for a series that has been landing early, up to four days more', () => {
      // Usual day is the 27th and the 25th was two days early, so the window opens on the 24th.
      const rows = ['2026-01-28', '2026-02-27', '2026-03-25', '2026-04-29', '2026-05-27'].map((d) => row(d))
      expect(datesOf(rows, '2026-06-23')).toEqual([])
      expect(upcoming(rows, '2026-06-24')).toMatchObject([{ predictedDate: '2026-06-27', leadDays: 3 }])
    })

    it('does not open weeks early for a charge billed on the 1st or the 31st', () => {
      const rows = ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'].map((d) => row(d))
      expect(datesOf(rows, '2026-06-20')).toEqual([])
      expect(datesOf(rows, '2026-06-29')).toEqual(['2026-06-30'])
    })

    it('follows a billing day that has moved, after two charges on the new day', () => {
      const rows = ['2026-01-05', '2026-02-05', '2026-03-05', '2026-04-05', '2026-05-10', '2026-06-10'].map((d) => row(d))
      expect(datesOf(rows, '2026-07-04')).toEqual([])
      expect(datesOf(rows, '2026-07-09')).toEqual(['2026-07-10'])
    })

    it('is at the usual day for a charge that moves between the end and the start of the month', () => {
      const rows = ['2026-02-27', '2026-03-31', '2026-05-01', '2026-05-31', '2026-07-01', '2026-07-31'].map((d) => row(d))
      // Usual day is the last of the month, give or take a day: August opens on the 30th at the latest.
      const [suggestion] = upcoming(rows, '2026-08-30')
      expect(['2026-08-31', '2026-09-01']).toContain(suggestion!.predictedDate)
    })
  })

  describe('a charge that is already logged', () => {
    it('is gone from the card, and the next one is a month away', () => {
      const rows = gymOnThe5th([row('2026-07-05')])
      expect(datesOf(rows, '2026-07-05')).toEqual([])
      expect(datesOf(rows, '2026-07-12')).toEqual([])
      expect(datesOf(rows, '2026-08-04')).toEqual(['2026-08-05'])
    })

    it('counts when it was logged a day early or on a later day than the usual one', () => {
      expect(datesOf(gymOnThe5th([row('2026-07-04')]), '2026-07-05')).toEqual([])
      expect(datesOf(gymOnThe5th([row('2026-07-08')]), '2026-07-05')).toEqual([])
    })

    it('counts a charge logged up to five days before the usual day, whichever month it is booked to', () => {
      expect(datesOf(gymOnThe5th([row('2026-06-30')]), '2026-07-05')).toEqual([])
      expect(datesOf(gymOnThe5th([row('2026-06-29')]), '2026-07-05')).toEqual(['2026-07-05'])
    })

    it('counts a charge logged a week or more early when it is booked to the same budget month', () => {
      // Streaming bills on the 10th and this month's was logged on the 3rd.
      const rows = [...monthlyDates(2026, 1, 10, 9).map((date) => row(date)), row('2026-10-03')]
      expect(datesOf(rows, '2026-10-10')).toEqual([])
      expect(datesOf(rows, '2026-10-17')).toEqual([])
      expect(datesOf(rows, '2026-11-09')).toEqual(['2026-11-10'])
    })

    it('does not count a charge logged that early when it is booked to the month before', () => {
      const early = gymOnThe5th([row('2026-06-28', { budgetMonth: '2026-06' })])
      expect(datesOf(early, '2026-07-05')).toEqual(['2026-07-05'])
      const sameMonth = gymOnThe5th([row('2026-06-28', { budgetMonth: '2026-07' })])
      expect(datesOf(sameMonth, '2026-07-05')).toEqual([])
    })

    it('counts a charge up to twenty days before the usual date and not a day further back', () => {
      // Gym on the 25th; a row on 5 October is twenty days before 25 October, one on the 4th is 21.
      const gym25 = monthlyDates(2026, 1, 25, 9).map((date) => row(date))
      expect(datesOf([...gym25, row('2026-10-05')], '2026-10-25')).toEqual([])
      expect(datesOf([...gym25, row('2026-10-04')], '2026-10-25')).toEqual(['2026-10-25'])
    })

    it('reads a charge booked to the next month the way the series books them', () => {
      // Every charge on the 25th is booked to the month after. The one on 18 October is booked to
      // November, as 25 October will be, so it is that charge; booked to October it is not.
      const booked = monthlyDates(2026, 1, 25, 9).map((date) =>
        row(date, { budgetMonth: `${addDaysIso(date, 10).slice(0, 7)}` }),
      )
      expect(datesOf([...booked, row('2026-10-18', { budgetMonth: '2026-11' })], '2026-10-25')).toEqual([])
      expect(datesOf([...booked, row('2026-10-18', { budgetMonth: '2026-10' })], '2026-10-25')).toEqual(['2026-10-25'])
    })

    it('does not count a charge in the same budget month that is more than twenty days off', () => {
      // 14 Sep booked to October is September's charge, a month before 14 October.
      const rows = [
        row('2026-07-14', { budgetMonth: '2026-07' }),
        row('2026-08-14', { budgetMonth: '2026-08' }),
        row('2026-09-14', { budgetMonth: '2026-10' }),
      ]
      expect(datesOf(rows, '2026-10-14')).toEqual(['2026-10-14'])
    })

    it('is not taken for the next charge by an extra row logged in the middle of the month', () => {
      // An adjustment on the 20th is not June's charge or July's.
      expect(datesOf(gymOnThe5th([row('2026-06-20')]), '2026-07-05')).toEqual(['2026-07-05'])
    })

    it('counts when it was booked to a different budget month than the series usually is', () => {
      // Rent on the 1st, paid on Saturday the 29th for 1 December. It is December's charge whichever
      // month it was booked to, so there is no card for 1 December and the next one is for January.
      const rows = [
        ...monthlyDates(2026, 1, 1, 11).map((date) => row(date, { description: 'Rent' })),
        row('2026-11-29', { description: 'Rent', budgetMonth: '2026-12' }),
      ]
      expect(datesOf(rows, '2026-12-01')).toEqual([])
      expect(datesOf(rows, '2026-12-30')).toEqual(['2027-01-01'])
    })
  })

  describe('a charge that is not logged', () => {
    it('is still followed by the reminder for the month after it', () => {
      // July was never logged. 5 July has gone from the card, and 5 August is on it.
      expect(datesOf(gymOnThe5th(), '2026-07-20')).toEqual([])
      expect(datesOf(gymOnThe5th(), '2026-08-04')).toEqual(['2026-08-05'])
      expect(datesOf(gymOnThe5th(), '2026-08-12')).toEqual(['2026-08-05'])
      expect(datesOf(gymOnThe5th(), '2026-08-13')).toEqual([])
    })

    it('stops after two in a row, so a cancelled subscription leaves the card', () => {
      expect(datesOf(gymOnThe5th(), '2026-09-04')).toEqual([])
      expect(datesOf(gymOnThe5th(), '2026-09-10')).toEqual([])
      expect(datesOf(gymOnThe5th(), '2027-01-05')).toEqual([])
    })

    it('comes back as soon as the missing charges are logged', () => {
      const backfilled = gymOnThe5th([row('2026-07-05'), row('2026-08-05')])
      expect(datesOf(backfilled, '2026-09-04')).toEqual(['2026-09-05'])
    })

    it('is picked up again once a charge is logged after a long gap', () => {
      const resumed = gymOnThe5th([row('2026-11-05')])
      expect(datesOf(resumed, '2026-11-20')).toEqual([])
      expect(datesOf(resumed, '2026-12-04')).toEqual(['2026-12-05'])
    })
  })

  describe('which budget month a suggestion belongs to', () => {
    it('follows the newest three charges when the booking habit has changed', () => {
      // Four booked to their own month, then three to the month after.
      const rows = monthlyDates(2026, 1, 5, 7).map((date, i) =>
        row(date, { budgetMonth: i < 4 ? date.slice(0, 7) : `${addDaysIso(date, 31).slice(0, 7)}` }),
      )
      expect(upcoming(rows, '2026-08-05')).toMatchObject([
        { predictedDate: '2026-08-05', predictedBudgetMonth: '2026-09' },
      ])
    })

    it('follows how the series is booked: a pay date on the 25th that rolls into the next month', () => {
      const rows = monthlyDates(2026, 1, 25, 6).map((date) =>
        row(date, { description: 'Payroll', type: 'income', budgetMonth: `${addDaysIso(date, 7).slice(0, 7)}` }),
      )
      expect(upcoming(rows, '2026-07-24')).toMatchObject([
        { predictedDate: '2026-07-25', predictedBudgetMonth: '2026-08' },
      ])
    })

    it('still shows the charge when the newest one was booked to a different month than the two before', () => {
      // 14 Jul and 14 Aug booked to their own months, 14 Sep to October: the series is due on
      // 14 October all the same, and the card says so.
      const rows = [
        row('2026-07-14', { budgetMonth: '2026-07' }),
        row('2026-08-14', { budgetMonth: '2026-08' }),
        row('2026-09-14', { budgetMonth: '2026-10' }),
      ]
      expect(upcoming(rows, '2026-10-14')).toMatchObject([
        { predictedDate: '2026-10-14', predictedBudgetMonth: '2026-10' },
      ])
    })

    it('still shows the next charge after one posted a couple of days early left a month with no row', () => {
      // The 14th books to the next month when the month starts on the 13th. The charge on 12 Oct
      // went to October, so November has no row, and the charge due on 14 Nov is for December.
      const rows = [
        row('2026-06-14', { budgetMonth: '2026-07' }),
        row('2026-07-14', { budgetMonth: '2026-08' }),
        row('2026-08-14', { budgetMonth: '2026-09' }),
        row('2026-09-14', { budgetMonth: '2026-10' }),
        row('2026-10-12', { budgetMonth: '2026-10' }),
      ]
      expect(upcoming(rows, '2026-11-14')).toMatchObject([
        { predictedDate: '2026-11-14', predictedBudgetMonth: '2026-12', leadDays: 3 },
      ])
    })

    it('is shown for the first day of a budget month before anything is logged in it', () => {
      // Nothing here depends on the month that is open, so a charge on the 13th of a month that
      // starts on the 13th is on the card on the 12th.
      const rows = monthlyDates(2026, 1, 13, 6).map((date) => row(date, { budgetMonth: `${addDaysIso(date, 31).slice(0, 7)}` }))
      expect(datesOf(rows, '2026-07-12')).toEqual(['2026-07-13'])
    })
  })

  describe('time zones', () => {
    function inEachZone<T>(compute: () => T): T[] {
      const originalTz = process.env.TZ
      try {
        return ['UTC', 'America/Los_Angeles', 'Pacific/Apia', 'Australia/Lord_Howe'].map((tz) => {
          process.env.TZ = tz
          return compute()
        })
      } finally {
        if (originalTz === undefined) delete process.env.TZ
        else process.env.TZ = originalTz
      }
    }

    it('gives the same answer wherever the device is, across the day the clocks go forward', () => {
      // Billed on the 9th; the clocks went forward on Sunday 8 March in Los Angeles.
      const rows = [row('2025-12-09'), row('2026-01-09'), row('2026-02-09')]
      const days = ['2026-03-07', '2026-03-08', '2026-03-09', '2026-03-16', '2026-03-17']
      const answers = inEachZone(() => days.map((d) => datesOf(rows, d).join()))
      expect(answers[0]).toEqual(['', '2026-03-09', '2026-03-09', '2026-03-09', ''])
      for (const answer of answers) expect(answer).toEqual(answers[0])
    })

    it('gives the same answer wherever the device is, across the day the clocks go back', () => {
      // Billed on the 1st; the clocks went back on Sunday 1 November in Los Angeles.
      const rows = [row('2026-08-01'), row('2026-09-01'), row('2026-10-01')]
      const days = ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-08', '2026-11-09']
      const answers = inEachZone(() => days.map((d) => datesOf(rows, d).join()))
      expect(answers[0]).toEqual(['', '2026-11-01', '2026-11-01', '2026-11-01', ''])
      for (const answer of answers) expect(answer).toEqual(answers[0])
    })
  })
})
