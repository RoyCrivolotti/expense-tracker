import { describe, expect, it, vi } from 'vitest'
import { defaultBudgetMonth } from '../engine/dates'
import { recommendedBudgetMonth } from '../engine/status'
import {
  MIN_SIGHTINGS,
  bookingDates,
  bankMerchantName,
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

describe('bankMerchantName', () => {
  it('drops the words that hold a digit and keeps the bank spelling', () => {
    expect(bankMerchantName('CAFE EXAMPLE 0042')).toBe('CAFE EXAMPLE')
    expect(bankMerchantName('Shop No7 North')).toBe('Shop North')
  })

  it('keeps the bank text when every word holds a digit, and is empty for nothing', () => {
    expect(bankMerchantName('0042 7B')).toBe('0042 7B')
    expect(bankMerchantName('')).toBe('')
  })
})

const TODAY = '2026-11-14'
const history = (rows: HistoryRow[], bank = 'CAFE EXAMPLE 0042') => merchantHistory(buildMerchantIndex(rows, TODAY), bank)
const rows = (n: number, over: Partial<HistoryRow> = {}, from = 100): HistoryRow[] =>
  Array.from({ length: n }, (_, i) => row({ id: from + i, date: `2026-0${(i % 9) + 1}-10`, ...over }))

describe('merchantHistory', () => {
  it('counts typed expenses with the merchant name and reads the usual description and category', () => {
    const held = [
      row({ id: 1, date: '2026-09-01', description: 'cafe example', categoryId: 5 }),
      row({ id: 2, date: '2026-10-05', description: 'Cafe Example ', categoryId: 3 }),
      row({ id: 3, date: '2026-10-05', description: 'Café Example', categoryId: 3 }),
    ]

    expect(history(held)).toEqual({ sightings: 3, label: 'Café Example', categoryId: 3, settled: true })
  })

  it('prefers the usual description to a newer one-off', () => {
    // The merchant key drops words that hold a digit, so "Cafe Example 7" is this merchant under another description.
    const held = [...rows(4, { description: 'Cafe Example' }), row({ id: 900, date: '2026-11-10', description: 'Cafe Example 7', categoryId: 9 })]

    expect(history(held, 'Cafe Example')).toMatchObject({ label: 'Cafe Example', categoryId: 3, settled: true })
  })

  it('lets a rename that has become the majority overtake the old name, and spells it as last typed', () => {
    const held = [
      ...rows(2, { description: 'Cafe Example', date: '2026-03-01' }),
      row({ id: 50, date: '2026-09-01', description: 'cafe example 9' }),
      row({ id: 51, date: '2026-10-01', description: 'CAFE EXAMPLE 9' }),
      row({ id: 52, date: '2026-11-01', description: 'Café Example 9' }),
    ]

    expect(history(held)).toMatchObject({ label: 'Café Example 9', settled: true })
  })

  it('does not count an old majority outside the window', () => {
    const held = [
      ...rows(5, { description: 'Cafe Example 8', date: '2025-06-01' }),
      row({ id: 60, date: '2026-09-01', description: 'Cafe Example' }),
      row({ id: 61, date: '2026-10-01', description: 'Cafe Example' }),
    ]

    expect(history(held, 'Cafe Example')).toMatchObject({ label: 'Cafe Example', sightings: 7, settled: true })
  })

  it('counts a row exactly one year back and not the day before', () => {
    const edge = [row({ id: 1, date: '2025-11-14', description: 'Cafe Example' }), row({ id: 2, date: '2025-11-13', description: 'Cafe Example' })]

    expect(history(edge, 'Cafe Example').settled).toBe(false)
    expect(history([...edge, row({ id: 3, date: '2026-01-01', description: 'Cafe Example' })], 'Cafe Example').settled).toBe(true)
  })

  it('clamps the window start on a short month', () => {
    const at = (today: string, dates: string[]) =>
      merchantHistory(buildMerchantIndex(dates.map((date, i) => row({ id: i + 1, date })), today), 'Cafe Example').settled

    // A year before 29 Feb 2028 is 28 Feb 2027, since 2027 has no 29 Feb.
    expect(at('2028-02-29', ['2027-02-28', '2027-03-01'])).toBe(true)
    expect(at('2028-02-29', ['2027-02-27', '2027-02-28'])).toBe(false)
  })

  it('gives the tie to the more recent description, but never settles it', () => {
    const held = [
      row({ id: 1, date: '2026-08-01', description: 'Cafe Example 1' }),
      row({ id: 2, date: '2026-09-01', description: 'Cafe Example 1' }),
      row({ id: 3, date: '2026-10-01', description: 'Cafe Example 2' }),
      row({ id: 4, date: '2026-10-02', description: 'Cafe Example 2' }),
    ]

    expect(history(held, 'Cafe Example')).toMatchObject({ label: 'Cafe Example 2', settled: false })
  })

  it('breaks a tie on the date by the higher id, whatever order the rows arrive in', () => {
    const a = row({ id: 7, description: 'Cafe Example 1', categoryId: 1 })
    const b = row({ id: 9, description: 'Cafe Example 2', categoryId: 2 })

    expect(history([a, b], 'Cafe Example').label).toBe('Cafe Example 2')
    expect(history([b, a], 'Cafe Example').label).toBe('Cafe Example 2')
  })

  it('takes the category from the winning description rows, not from the merchant as a whole', () => {
    const held = [
      row({ id: 1, date: '2026-09-01', description: 'Cafe Example 1', categoryId: 4 }),
      row({ id: 2, date: '2026-09-02', description: 'Cafe Example 1', categoryId: 4 }),
      row({ id: 3, date: '2026-09-03', description: 'Cafe Example 1', categoryId: 6 }),
      row({ id: 4, date: '2026-10-01', description: 'Cafe Example 3', categoryId: 8 }),
      row({ id: 5, date: '2026-10-02', description: 'Cafe Example 3', categoryId: 8 }),
    ]

    expect(history(held, 'Cafe Example')).toMatchObject({ label: 'Cafe Example 1', categoryId: 4, settled: true })
  })

  it('gives a category tie to the more recent row', () => {
    const held = [
      row({ id: 1, date: '2026-09-01', categoryId: 4 }),
      row({ id: 2, date: '2026-10-01', categoryId: 6 }),
    ]

    expect(history(held, 'Cafe Example').categoryId).toBe(6)
  })

  it('needs the winner at least twice to settle', () => {
    expect(history([row({ id: 1 }), row({ id: 2, description: 'Cafe Example 5', date: '2026-10-02' })], 'Cafe Example').settled).toBe(false)
  })

  it('falls back to the newest row when fewer than two are recent, and does not settle', () => {
    const held = [
      row({ id: 1, date: '2024-01-01', description: 'Cafe Example 8', categoryId: 1 }),
      row({ id: 2, date: '2024-02-01', description: 'Cafe Example 8', categoryId: 1 }),
      row({ id: 3, date: '2026-10-01', description: 'Cafe Example 9', categoryId: 2 }),
    ]

    expect(history(held, 'Cafe Example')).toEqual({ sightings: 3, label: 'Cafe Example 9', categoryId: 2, settled: false })
  })

  it('reads the window from this device\'s calendar day when none is given', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 14, 12))
    try {
      const held = [row({ id: 1, date: '2026-10-01' }), row({ id: 2, date: '2026-10-02' })]
      expect(merchantHistory(buildMerchantIndex(held), 'Cafe Example').settled).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('knows nothing of a person with no rows: the index holds only the rows it is given', () => {
    // The dataset the index reads is the signed-in person's own, so another person's habits are never in it.
    const mine = [row({ id: 1, description: 'Cafe Example 1' }), row({ id: 2, description: 'Cafe Example 1' })]

    expect(history([], 'Cafe Example').label).toBeNull()
    expect(history(mine, 'Cafe Example').label).toBe('Cafe Example 1')
  })

  it('ignores cancelled rows, other types, other merchants and a longer name', () => {
    const held = [
      row({ cancelled: true }),
      row({ type: 'income' }),
      row({ description: 'Cafe Elsewhere' }),
      row({ description: 'Cafe Example Two' }),
    ]

    expect(history(held, 'CAFE EXAMPLE')).toEqual({ sightings: 0, label: null, categoryId: null, settled: false })
  })

  it('knows nothing of a payment with no text', () => {
    expect(merchantHistory(buildMerchantIndex([row()], TODAY), null).sightings).toBe(0)
    expect(merchantHistory(buildMerchantIndex([row({ description: '12 34' })], TODAY), '12 34').sightings).toBe(0)
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
  settled: true,
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
    ['seen once', { sightings: MIN_SIGHTINGS - 1, settled: false }, 'new-merchant'],
    ['a description not settled', { settled: false }, 'mixed-description'],
  ])('asks for a look on %s', (_name, over, reason) => {
    expect(reviewReasons({ ...clean, ...over })).toContain(reason)
  })

  it('does not call a merchant new when there is no merchant to be new', () => {
    expect(reviewReasons({ ...clean, hasMerchant: false, sightings: 0 })).toEqual(['no-merchant'])
    expect(reviewReasons({ ...clean, sightings: 1, settled: false })).toEqual(['new-merchant'])
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
