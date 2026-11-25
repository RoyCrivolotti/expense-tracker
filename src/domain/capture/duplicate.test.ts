import { describe, expect, it } from 'vitest'
import {
  ANNOUNCED_CHARGE_DAYS,
  DUPLICATE_WINDOW,
  candidateSpan,
  canMatch,
  dayGap,
  mayAnswerBoth,
  paymentDirection,
  possibleMatchFor,
  possibleMatchesFor,
  type PagePayment,
  rowDirection,
  type PaymentToMatch,
  type TypedRow,
} from './duplicate'

const payment = (over: Partial<PaymentToMatch> = {}): PaymentToMatch => ({
  localDate: '2026-11-10',
  amountCents: 1250,
  currency: 'EUR',
  suggestedType: 'expense',
  ...over,
})
const row = (over: Partial<TypedRow> = {}): TypedRow => ({
  id: 1,
  date: '2026-11-10',
  description: 'Cafe',
  type: 'expense',
  amountCents: 1250,
  ...over,
})

describe('the window', () => {
  it('is 14 days back and 3 forward, in one constant', () => {
    expect(DUPLICATE_WINDOW).toEqual({ daysBack: 14, daysForward: 3 })
  })
})

describe('direction', () => {
  it('reads out for an expense and an investment, in for income and a refund, and nothing for an unknown type', () => {
    expect(paymentDirection('expense')).toBe('out')
    expect(paymentDirection('investment')).toBe('out')
    expect(paymentDirection('income')).toBe('in')
    expect(paymentDirection('refund')).toBe('in')
    expect(paymentDirection(null)).toBeNull()
  })

  it('reads a typed row the same way, with an investment taken back out counting as money in', () => {
    expect(rowDirection('expense', 100)).toBe('out')
    expect(rowDirection('income', 100)).toBe('in')
    expect(rowDirection('refund', 100)).toBe('in')
    expect(rowDirection('investment', 100)).toBe('out')
    expect(rowDirection('investment', -100)).toBe('in')
  })
})

describe('canMatch', () => {
  it('needs a type, an amount above zero and euros (or no currency)', () => {
    expect(canMatch(payment())).toBe(true)
    expect(canMatch(payment({ currency: null }))).toBe(true)
    expect(canMatch(payment({ suggestedType: null }))).toBe(false)
    expect(canMatch(payment({ amountCents: null }))).toBe(false)
    expect(canMatch(payment({ amountCents: 0 }))).toBe(false)
    expect(canMatch(payment({ currency: 'USD' }))).toBe(false)
  })
})

describe('dayGap and candidateSpan', () => {
  it('counts days across a month, a year and a leap day', () => {
    expect(dayGap('2026-11-24', '2026-11-10')).toBe(14)
    expect(dayGap('2026-11-10', '2026-11-24')).toBe(-14)
    expect(dayGap('2027-01-02', '2026-12-31')).toBe(2)
    expect(dayGap('2028-03-01', '2028-02-28')).toBe(2)
  })

  it('spans the matchable payments widened by the window, and is nothing when none can be matched', () => {
    expect(
      candidateSpan([
        payment({ localDate: '2026-11-10' }),
        payment({ localDate: '2026-11-20' }),
        payment({ localDate: '2026-01-01', suggestedType: null }),
      ]),
    ).toEqual({ from: '2026-10-27', to: '2026-11-23' })
    expect(candidateSpan([payment({ amountCents: null })])).toBeNull()
    expect(candidateSpan([])).toBeNull()
  })
})

describe('possibleMatchFor', () => {
  it('finds a typed row of the same price, direction and day', () => {
    expect(possibleMatchFor(payment(), [row({ id: 7, description: 'Cafe', date: '2026-11-10' })])).toEqual({
      transactionId: 7,
      description: 'Cafe',
      date: '2026-11-10',
    })
  })

  it('takes a row 14 days before and not 15, and 3 days after and not 4', () => {
    expect(possibleMatchFor(payment(), [row({ date: '2026-10-27' })])).not.toBeNull()
    expect(possibleMatchFor(payment(), [row({ date: '2026-10-26' })])).toBeNull()
    expect(possibleMatchFor(payment(), [row({ date: '2026-11-13' })])).not.toBeNull()
    expect(possibleMatchFor(payment(), [row({ date: '2026-11-14' })])).toBeNull()
  })

  it('does not match a price that differs by a cent, or the same price the other way round', () => {
    expect(possibleMatchFor(payment(), [row({ amountCents: 1251 })])).toBeNull()
    expect(possibleMatchFor(payment(), [row({ type: 'income' })])).toBeNull()
    expect(possibleMatchFor(payment({ suggestedType: 'income' }), [row({ type: 'expense' })])).toBeNull()
    expect(possibleMatchFor(payment({ suggestedType: 'income' }), [row({ type: 'refund' })])).not.toBeNull()
  })

  it('matches an investment taken back out with an inflow, and a deposit with an outflow', () => {
    expect(
      possibleMatchFor(payment({ suggestedType: 'income' }), [row({ type: 'investment', amountCents: -1250 })]),
    ).not.toBeNull()
    expect(possibleMatchFor(payment(), [row({ type: 'investment', amountCents: 1250 })])).not.toBeNull()
    expect(possibleMatchFor(payment(), [row({ type: 'investment', amountCents: -1250 })])).toBeNull()
  })

  it('picks the closest by date, and the highest id on a tie', () => {
    const rows = [
      row({ id: 1, date: '2026-11-02' }),
      row({ id: 2, date: '2026-11-08' }),
      row({ id: 3, date: '2026-11-12' }),
      row({ id: 4, date: '2026-11-08' }),
    ]

    expect(possibleMatchFor(payment(), rows)?.transactionId).toBe(4)
    expect(possibleMatchFor(payment(), [...rows].reverse())?.transactionId).toBe(4)
  })

  it('counts a day before and a day after as equally close, so the later id wins', () => {
    expect(
      possibleMatchFor(payment(), [row({ id: 5, date: '2026-11-09' }), row({ id: 6, date: '2026-11-11' })])
        ?.transactionId,
    ).toBe(6)
  })

  it('matches nothing for a payment that cannot be matched', () => {
    expect(possibleMatchFor(payment({ suggestedType: null }), [row()])).toBeNull()
    expect(possibleMatchFor(payment({ currency: 'USD' }), [row()])).toBeNull()
    expect(possibleMatchFor(payment({ amountCents: null }), [row()])).toBeNull()
  })
})

describe('possibleMatchesFor, one row to one payment', () => {
  const page = (
    id: string,
    localDate: string,
    createdAt = `${localDate}T09:00:00.000Z`,
    over: Partial<PaymentToMatch> = {},
  ): PagePayment => ({ ...payment({ localDate, ...over }), id, createdAt })
  const ids = (m: Map<string, { transactionId: number } | null>) =>
    Object.fromEntries([...m].map(([k, v]) => [k, v?.transactionId ?? null]))

  it('gives a row to the payment it is closest to, and the other payment of that price gets none', () => {
    const result = possibleMatchesFor(
      [page('a', '2026-11-10'), page('b', '2026-11-11')],
      [row({ id: 5, date: '2026-11-10' })],
    )

    expect(ids(result)).toEqual({ a: 5, b: null })
  })

  it('lets the payment that loses its row fall to its next best one', () => {
    const result = possibleMatchesFor(
      [page('a', '2026-11-10'), page('b', '2026-11-11')],
      [row({ id: 5, date: '2026-11-10' }), row({ id: 3, date: '2026-11-08' })],
    )

    expect(ids(result)).toEqual({ a: 5, b: 3 })
  })

  it('gives a row equally close to two payments to the newer one, whatever order they come in', () => {
    const older = page('older', '2026-11-09', '2026-11-09T08:00:00.000Z')
    const newer = page('newer', '2026-11-11', '2026-11-11T08:00:00.000Z')
    const rows = [row({ id: 5, date: '2026-11-10' })]

    expect(ids(possibleMatchesFor([older, newer], rows))).toEqual({ older: null, newer: 5 })
    expect(ids(possibleMatchesFor([newer, older], rows))).toEqual({ older: null, newer: 5 })
  })

  it('keeps the same answer as the one-payment rule when there is no competition, and none for a payment that cannot match', () => {
    const rows = [row({ id: 1, date: '2026-11-08' }), row({ id: 2, date: '2026-11-12' })]
    const a = page('a', '2026-11-10')
    const result = possibleMatchesFor([a, page('x', '2026-11-10', undefined, { suggestedType: null })], rows)

    expect(result.get('a')?.transactionId).toBe(possibleMatchFor(a, rows)?.transactionId)
    expect(result.get('x')).toBeNull()
  })

  it("does not let payments of different prices take each other's rows", () => {
    const result = possibleMatchesFor(
      [page('a', '2026-11-10'), page('b', '2026-11-10', undefined, { amountCents: 999 })],
      [row({ id: 5 }), row({ id: 6, amountCents: 999 })],
    )

    expect(ids(result)).toEqual({ a: 5, b: 6 })
  })
})

describe('a row a recommendation already answers for', () => {
  // Pushes on the phone's clock, UTC+1. An announcement arrives the evening before the day it names.
  const announcement = (
    day = '2026-11-10',
    at = '2026-11-09T21:30:00+01:00',
  ) => ({ occurredAt: at, localDate: day })
  const report = (
    day = '2026-11-10',
    at = `${day}T06:10:00+01:00`,
  ) => ({ occurredAt: at, localDate: day })

  it('may answer for any push when no recommendation answers for it', () => {
    expect([
      mayAnswerBoth(report(), null),
      mayAnswerBoth(announcement(), undefined),
      mayAnswerBoth(undefined, null),
    ]).toEqual([true, true, true])
  })

  it('pairs an announcement with the report that came after it, in either order of review', () => {
    expect(mayAnswerBoth(report(), announcement())).toBe(true)
    expect(mayAnswerBoth(announcement(), report())).toBe(true)
  })

  it('never pairs two reports, two announcements, or a row with a payment that came from no push', () => {
    expect(mayAnswerBoth(report(), report('2026-11-10', '2026-11-10T18:00:00+01:00'))).toBe(false)
    expect(mayAnswerBoth(announcement(), announcement('2026-11-10', '2026-11-09T21:35:00+01:00'))).toBe(false)
    expect(mayAnswerBoth(undefined, announcement())).toBe(false)
  })

  it('never pairs an announcement that arrived after the report', () => {
    const late = announcement('2026-11-11', '2026-11-10T07:00:00+01:00')
    expect(mayAnswerBoth(late, report())).toBe(false)
    expect(mayAnswerBoth(report(), late)).toBe(false)
    // A report stored in UTC, from before the Worker kept the phone's offset, counts as reported whatever its date says,
    // so only the arrival tells this announcement came after it.
    const stored = { occurredAt: '2026-11-08T10:00:00.000Z', localDate: '2026-11-10' }
    expect(mayAnswerBoth(announcement('2026-11-10', '2026-11-09T21:30:00+01:00'), stored)).toBe(false)
    expect(mayAnswerBoth(announcement(), { ...stored, occurredAt: '2026-11-09T22:00:00.000Z' })).toBe(true)
  })

  it('pairs a report dated on the named day up to seven days later, and no earlier or later', () => {
    const at = (day: string) => mayAnswerBoth(report(day, '2026-11-18T23:00:00+01:00'), announcement())
    expect(ANNOUNCED_CHARGE_DAYS).toBe(7)
    expect(['2026-11-09', '2026-11-10', '2026-11-17', '2026-11-18'].map(at)).toEqual([false, true, true, false])
  })

  it('is matched by that rule and the usual ones: amount, window and direction', () => {
    const announcedRow = row({ answers: announcement() })
    const charge = payment({ push: report() })
    expect(possibleMatchFor(charge, [announcedRow])?.transactionId).toBe(1)
    expect(possibleMatchFor(payment({ push: announcement() }), [announcedRow])).toBeNull()
    expect(possibleMatchFor(charge, [row({ answers: report('2026-11-10', '2026-11-10T05:00:00+01:00') })])).toBeNull()
    expect(possibleMatchFor(payment({ push: announcement() }), [row({ answers: report() })])?.transactionId).toBe(1)
    expect(possibleMatchFor(charge, [{ ...announcedRow, amountCents: 1251 }])).toBeNull()
    expect(possibleMatchFor(charge, [{ ...announcedRow, date: '2026-11-14' }])).toBeNull()
    expect(possibleMatchFor(payment({ push: report(), suggestedType: 'income' }), [announcedRow])).toBeNull()
  })
})
