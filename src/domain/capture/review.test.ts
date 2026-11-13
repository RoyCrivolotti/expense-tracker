import { describe, expect, it } from 'vitest'
import { defaultBudgetMonth } from '../engine/dates'
import { recommendedBudgetMonth } from '../engine/status'
import {
  MIN_SIGHTINGS,
  bookingDates,
  buildMerchantIndex,
  merchantHistory,
  merchantKey,
  otherBudgetDays,
  paymentClock,
  reviewReasons,
  shiftDay,
  type HistoryRow,
  type ReviewFacts,
} from './review'

const row = (over: Partial<HistoryRow> = {}): HistoryRow => ({
  id: 1,
  date: '2026-10-01',
  description: 'Cafe Example',
  type: 'expense',
  categoryId: 3,
  cancelled: false,
  ...over,
})

describe('merchantKey', () => {
  it('folds case and accents and drops the words that hold a digit', () => {
    expect(merchantKey('CAFÉ EXAMPLE 0042')).toBe('cafe example')
    expect(merchantKey('  Shop   No7 North ')).toBe('shop north')
  })

  it('is empty when nothing readable is left', () => {
    expect(merchantKey('0042 7')).toBe('')
    expect(merchantKey('')).toBe('')
  })
})

describe('merchantHistory', () => {
  it('counts typed expenses with the merchant name and takes the newest row category and spelling', () => {
    const rows = [
      row({ id: 1, date: '2026-09-01', description: 'cafe example', categoryId: 5 }),
      row({ id: 2, date: '2026-10-05', description: 'Cafe Example ', categoryId: 3 }),
      row({ id: 3, date: '2026-10-05', description: 'Café Example', categoryId: 4 }),
    ]

    expect(merchantHistory(buildMerchantIndex(rows), 'CAFE EXAMPLE 0042')).toEqual({ sightings: 3, label: 'Café Example', categoryId: 4 })
  })

  it('breaks a tie on the date by the higher id, whatever order the rows arrive in', () => {
    const a = row({ id: 7, categoryId: 1 })
    const b = row({ id: 9, categoryId: 2 })

    expect(merchantHistory(buildMerchantIndex([a, b]), 'Cafe Example').categoryId).toBe(2)
    expect(merchantHistory(buildMerchantIndex([b, a]), 'Cafe Example').categoryId).toBe(2)
  })

  it('ignores cancelled rows, other types, other merchants and a longer name', () => {
    const rows = [
      row({ cancelled: true }),
      row({ type: 'income' }),
      row({ description: 'Cafe Elsewhere' }),
      row({ description: 'Cafe Example Two' }),
    ]

    expect(merchantHistory(buildMerchantIndex(rows), 'CAFE EXAMPLE')).toEqual({ sightings: 0, label: null, categoryId: null })
  })

  it('knows nothing of a payment with no text', () => {
    expect(merchantHistory(buildMerchantIndex([row()]), null).sightings).toBe(0)
    expect(merchantHistory(buildMerchantIndex([row({ description: '12 34' })]), '12 34').sightings).toBe(0)
  })
})

const monthWith = (rolloverDay: number) => (day: string) => defaultBudgetMonth(day, rolloverDay)
const edge = (rolloverDay: number, day: string, minute: number | null, arrived: string | null = null) => otherBudgetDays(monthWith(rolloverDay), day, minute, arrived)
const at = (h: number, m = 0) => h * 60 + m

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
      { id: 1, date: '2026-11-03', budgetMonth: '2026-11', description: 'x', accountId: 2, categoryId: 1, type: 'expense' as const, amountCents: 100, cancelled: false, status: 'posted' as const },
      { id: 2, date: '2026-12-01', budgetMonth: '2026-12', description: 'y', accountId: 2, categoryId: 1, type: 'expense' as const, amountCents: 100, cancelled: false, status: 'posted' as const },
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

    expect(a).toMatchObject({ minuteOfDay: 23 * 60 + 30, time: '23:30', arrivedDate: '2026-11-30', arrivedTime: '23:31' })
  })

  it('has no clock for a row written in UTC, or one whose day is not the payment day', () => {
    const none = { minuteOfDay: null, time: null, arrivedDate: null, arrivedTime: null }

    expect(paymentClock('2026-11-30T22:52:07.000Z', '2026-11-30', created)).toEqual(none)
    expect(paymentClock('2026-11-30T23:52:07+01:00', '2026-12-01', created)).toEqual(none)
    expect(paymentClock('not a date', '2026-11-30', created)).toEqual(none)
  })

  it('keeps the time of day when the arrival cannot be read', () => {
    expect(paymentClock('2026-11-30T23:52:07+01:00', '2026-11-30', 'nope')).toMatchObject({ time: '23:52', arrivedDate: null, arrivedTime: null })
  })
})

const clean: ReviewFacts = {
  amountCents: 1250,
  currency: 'EUR',
  hasMerchant: true,
  categoryId: 3,
  accountId: 1,
  suggestedType: 'expense',
  sightings: MIN_SIGHTINGS,
  monthEdge: false,
  possibleMatch: false,
}

describe('reviewReasons', () => {
  it('is empty for a known merchant with nothing in doubt, which is the only case for one tap', () => {
    expect(reviewReasons(clean)).toEqual([])
  })

  it.each<[string, Partial<ReviewFacts>, string]>([
    ['no amount', { amountCents: null }, 'no-amount'],
    ['a zero amount', { amountCents: 0 }, 'zero-amount'],
    ['an investment', { suggestedType: 'investment' }, 'own-money'],
    ['no merchant', { hasMerchant: false }, 'no-merchant'],
    ['no category', { categoryId: null }, 'no-category'],
    ['no account', { accountId: null }, 'no-account'],
    ['another currency', { currency: 'USD' }, 'foreign'],
    ['own money moved', { suggestedType: null }, 'own-money'],
    ['near month end', { monthEdge: true }, 'month-edge'],
    ['a possible match', { possibleMatch: true }, 'possible-match'],
    ['seen once', { sightings: MIN_SIGHTINGS - 1 }, 'new-merchant'],
  ])('asks for a look on %s', (_name, over, reason) => {
    expect(reviewReasons({ ...clean, ...over })).toContain(reason)
  })

  it('does not call a merchant new when there is no merchant to be new', () => {
    expect(reviewReasons({ ...clean, hasMerchant: false, sightings: 0 })).toEqual(['no-merchant'])
  })

  it('treats an unknown currency as euros, like the rest of the capture code', () => {
    expect(reviewReasons({ ...clean, currency: null })).toEqual([])
  })

  it('never allows one tap for a type the app cannot add in one tap: every suggested type is either added or sent to Review', () => {
    for (const suggestedType of ['expense', 'income', 'refund', 'investment', null] as const) {
      for (const amountCents of [null, 0, 1250]) {
        const reasons = reviewReasons({ ...clean, suggestedType, amountCents })
        const addable = suggestedType !== null && suggestedType !== 'investment' && amountCents !== null && amountCents > 0
        expect(reasons.length === 0, `${suggestedType} ${amountCents}`).toBe(addable)
      }
    }
  })

  it('lists every reason, not only the first', () => {
    const reasons = reviewReasons({ ...clean, categoryId: null, monthEdge: true, possibleMatch: true })
    expect(reasons).toEqual(['no-category', 'month-edge', 'possible-match'])
  })
})
