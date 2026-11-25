import { describe, expect, it } from 'vitest'
import { defaultBudgetMonth } from '../engine/dates'
import { recommendedBudgetMonth } from '../engine/status'
import { bookingDates, isAnnounced, messageDating, otherBudgetDays, paymentClock, shiftDay } from './reviewDates'

const monthWith = (rolloverDay: number) => (day: string) => defaultBudgetMonth(day, rolloverDay)
const edge = (
  rolloverDay: number,
  day: string,
  minute: number | null,
  arrived: string | null = null,
) => otherBudgetDays(monthWith(rolloverDay), day, minute, arrived)
const at = (
  h: number,
  m = 0,
) => h * 60 + m

describe('messageDating', () => {
  it('is the arrival on the phone clock when the payment is dated another day', () => {
    expect(messageDating('2026-11-23T21:32:07+01:00', '2026-11-24')).toEqual({
      arrivedDate: '2026-11-23',
      arrivedTime: '21:32',
    })
  })

  it('is null when the payment is dated the arrival day, or the row has no phone clock', () => {
    expect(messageDating('2026-11-23T21:32:07+01:00', '2026-11-23')).toBeNull()
    expect(messageDating('2026-11-23T20:32:07Z', '2026-11-24')).toBeNull()
  })
})

describe('isAnnounced', () => {
  it('is true when the push named a later day than the phone day it arrived on', () => {
    expect(isAnnounced('2026-11-23T21:32:07+01:00', '2026-11-24')).toBe(true)
    expect(isAnnounced('2026-12-31T19:00:00-05:00', '2027-01-03')).toBe(true)
  })

  it('is false for a push dated the day it arrived, or an earlier day it reported late', () => {
    expect(isAnnounced('2026-11-23T21:32:07+01:00', '2026-11-23')).toBe(false)
    expect(isAnnounced('2026-11-25T08:00:00+01:00', '2026-11-22')).toBe(false)
  })

  it('is false for a row in UTC, whose phone day is unknown, even past midnight there', () => {
    expect(isAnnounced('2026-11-23T23:30:00Z', '2026-11-24')).toBe(false)
    expect(isAnnounced('2026-11-23T23:30:00.000Z', '2026-11-24')).toBe(false)
  })
})

describe('shiftDay', () => {
  it('moves across months, years and a leap day', () => {
    expect(shiftDay('2026-11-30', 1)).toBe('2026-12-01')
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDay('2027-01-01', -1)).toBe('2026-12-31')
    expect(shiftDay('2028-02-28', 1)).toBe('2028-02-29')
    expect(shiftDay('2026-02-28', 1)).toBe('2026-03-01')
  })
})

describe('bookingDates', () => {
  it('is the payment day alone in the middle of the day', () => {
    expect(bookingDates('2026-11-10', at(12), null)).toEqual(['2026-11-10'])
  })

  it('adds the next day in the last hour and the day before in the first, and both when the time is unknown', () => {
    expect(bookingDates('2026-11-10', at(23), null)).toEqual(['2026-11-10', '2026-11-11'])
    expect(bookingDates('2026-11-10', at(22, 59), null)).toEqual(['2026-11-10'])
    expect(bookingDates('2026-11-10', at(0, 59), null)).toEqual(['2026-11-10', '2026-11-09'])
    expect(bookingDates('2026-11-10', at(1), null)).toEqual(['2026-11-10'])
    expect(bookingDates('2026-11-10', null, null)).toEqual(['2026-11-10', '2026-11-09', '2026-11-11'])
  })

  it('adds the day the push arrived on, once', () => {
    expect(bookingDates('2026-11-10', at(12), '2026-11-12')).toEqual(['2026-11-10', '2026-11-12'])
    expect(bookingDates('2026-11-10', at(23), '2026-11-11')).toEqual(['2026-11-10', '2026-11-11'])
  })
})

describe('otherBudgetDays with the calendar month (rollover day 1)', () => {
  it('finds the next month in the last hour of a month, and the previous in the first hour of the next', () => {
    expect(edge(1, '2026-11-30', at(23, 30))).toEqual(['2026-12-01'])
    expect(edge(1, '2026-12-01', at(0, 30))).toEqual(['2026-11-30'])
  })

  it('is empty an hour and a minute from the edge, and mid-month', () => {
    expect(edge(1, '2026-11-30', at(22, 59))).toEqual([])
    expect(edge(1, '2026-12-01', at(1))).toEqual([])
    expect(edge(1, '2026-11-15', at(23, 30))).toEqual([])
  })

  it('crosses a year end', () => {
    expect(edge(1, '2026-12-31', at(23, 30))).toEqual(['2027-01-01'])
    expect(edge(1, '2027-01-01', at(0, 5))).toEqual(['2026-12-31'])
  })

  it('knows a leap year: 28 Feb is an edge only in a year without 29 Feb', () => {
    expect(edge(1, '2026-02-28', at(23, 30))).toEqual(['2026-03-01'])
    expect(edge(1, '2028-02-28', at(23, 30))).toEqual([])
    expect(edge(1, '2028-02-29', at(23, 30))).toEqual(['2028-03-01'])
  })

  it('finds a push that reached the server in a later month, and an unreadable time next to an edge', () => {
    expect(edge(1, '2026-11-30', at(18), '2026-12-01')).toEqual(['2026-12-01'])
    expect(edge(1, '2026-11-30', null)).toEqual(['2026-12-01'])
    expect(edge(1, '2026-11-15', null)).toEqual([])
  })
})

describe('otherBudgetDays with a rollover day', () => {
  it('flags the evening before the rollover day, and not the calendar month end', () => {
    expect(edge(15, '2026-11-14', at(23, 30))).toEqual(['2026-11-15'])
    expect(edge(15, '2026-11-15', at(0, 30))).toEqual(['2026-11-14'])
    expect(edge(15, '2026-11-30', at(23, 30))).toEqual([])
    expect(edge(15, '2026-12-01', at(0, 30))).toEqual([])
  })

  it('works for the rollover day 28 and across a short month', () => {
    expect(edge(28, '2026-02-27', at(23, 30))).toEqual(['2026-02-28'])
    expect(edge(28, '2026-11-26', at(23, 30))).toEqual([])
  })

  it('moves a year end only when the rollover day sits there', () => {
    expect(edge(31, '2026-12-30', at(23, 30))).toEqual(['2026-12-31'])
    expect(edge(15, '2026-12-31', at(23, 30))).toEqual([])
  })
})

describe('otherBudgetDays with a settled month', () => {
  const dataset = (paid: boolean) => ({
    accounts: [{ id: 2, name: 'Card', kind: 'credit' as const, settlement: 'deferred' as const, active: true }],
    transactions: [
      {
        id: 1,
        date: '2026-11-03',
        budgetMonth: '2026-11',
        description: 'x',
        accountId: 2,
        categoryId: 1,
        type: 'expense' as const,
        amountCents: 100,
        cancelled: false,
        status: 'posted' as const,
      },
      {
        id: 2,
        date: '2026-12-01',
        budgetMonth: '2026-12',
        description: 'y',
        accountId: 2,
        categoryId: 1,
        type: 'expense' as const,
        amountCents: 100,
        cancelled: false,
        status: 'posted' as const,
      },
    ],
    accountStatements: paid ? [{ accountId: 2, yearMonth: '2026-11', paid: true }] : [],
  })
  const monthOf = (paid: boolean) => (day: string) => recommendedBudgetMonth(day, '2026-11-20', 1, dataset(paid))

  it('is one rule with the calendar edge: a settled current month moves every day in it, so only the edge itself differs', () => {
    expect(otherBudgetDays(monthOf(true), '2026-11-30', at(23, 30), null)).toEqual([])
    expect(monthOf(true)('2026-11-10')).toBe('2026-12')
    expect(monthOf(false)('2026-11-10')).toBe('2026-11')
    expect(otherBudgetDays(monthOf(false), '2026-11-30', at(23, 30), null)).toEqual(['2026-12-01'])
  })

  it('still finds a payment in the past month right at the edge of the settled one', () => {
    expect(otherBudgetDays(monthOf(true), '2026-10-31', at(23, 30), null)).toEqual(['2026-11-01'])
  })
})

describe('paymentClock', () => {
  const created = '2026-11-30T23:00:00.000Z'

  it("reads the phone's own time of day and the day and time the push arrived in the phone's zone", () => {
    expect(paymentClock('2026-11-30T23:52:07+01:00', '2026-11-30', created)).toEqual({
      minuteOfDay: 23 * 60 + 52,
      time: '23:52',
      arrivedDate: '2026-12-01',
      arrivedTime: '00:00',
    })
  })

  it('reads the same in any zone: it does not use the device clock', () => {
    const a = paymentClock('2026-11-30T23:30:00-05:00', '2026-11-30', '2026-12-01T04:31:00Z')

    expect(a).toMatchObject({
      minuteOfDay: 23 * 60 + 30,
      time: '23:30',
      arrivedDate: '2026-11-30',
      arrivedTime: '23:31',
    })
  })

  it('has no clock for a row written in UTC, or one whose day is not the payment day', () => {
    const none = { minuteOfDay: null, time: null, arrivedDate: null, arrivedTime: null }

    expect(paymentClock('2026-11-30T22:52:07.000Z', '2026-11-30', created)).toEqual(none)
    expect(paymentClock('2026-11-30T23:52:07+01:00', '2026-12-01', created)).toEqual(none)
    expect(paymentClock('not a date', '2026-11-30', created)).toEqual(none)
  })

  it('keeps the time of day when the arrival cannot be read', () => {
    expect(paymentClock('2026-11-30T23:52:07+01:00', '2026-11-30', 'nope')).toMatchObject({
      time: '23:52',
      arrivedDate: null,
      arrivedTime: null,
    })
  })
})
