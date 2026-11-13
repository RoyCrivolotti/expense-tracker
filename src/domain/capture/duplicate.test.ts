import { describe, expect, it } from 'vitest'
import {
  DUPLICATE_WINDOW,
  candidateSpan,
  canMatch,
  dayGap,
  paymentDirection,
  possibleMatchFor,
  rowDirection,
  type PaymentToMatch,
  type TypedRow,
} from './duplicate'

const payment = (over: Partial<PaymentToMatch> = {}): PaymentToMatch => ({ localDate: '2026-11-10', amountCents: 1250, currency: 'EUR', suggestedType: 'expense', ...over })
const row = (over: Partial<TypedRow> = {}): TypedRow => ({ id: 1, date: '2026-11-10', description: 'Cafe', type: 'expense', amountCents: 1250, ...over })

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
    expect(candidateSpan([payment({ localDate: '2026-11-10' }), payment({ localDate: '2026-11-20' }), payment({ localDate: '2026-01-01', suggestedType: null })])).toEqual({ from: '2026-10-27', to: '2026-11-23' })
    expect(candidateSpan([payment({ amountCents: null })])).toBeNull()
    expect(candidateSpan([])).toBeNull()
  })
})

describe('possibleMatchFor', () => {
  it('finds a typed row of the same price, direction and day', () => {
    expect(possibleMatchFor(payment(), [row({ id: 7, description: 'Cafe', date: '2026-11-10' })])).toEqual({ transactionId: 7, description: 'Cafe', date: '2026-11-10' })
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
    expect(possibleMatchFor(payment({ suggestedType: 'income' }), [row({ type: 'investment', amountCents: -1250 })])).not.toBeNull()
    expect(possibleMatchFor(payment(), [row({ type: 'investment', amountCents: 1250 })])).not.toBeNull()
    expect(possibleMatchFor(payment(), [row({ type: 'investment', amountCents: -1250 })])).toBeNull()
  })

  it('picks the closest by date, and the highest id on a tie', () => {
    const rows = [row({ id: 1, date: '2026-11-02' }), row({ id: 2, date: '2026-11-08' }), row({ id: 3, date: '2026-11-12' }), row({ id: 4, date: '2026-11-08' })]

    expect(possibleMatchFor(payment(), rows)?.transactionId).toBe(4)
    expect(possibleMatchFor(payment(), [...rows].reverse())?.transactionId).toBe(4)
  })

  it('counts a day before and a day after as equally close, so the later id wins', () => {
    expect(possibleMatchFor(payment(), [row({ id: 5, date: '2026-11-09' }), row({ id: 6, date: '2026-11-11' })])?.transactionId).toBe(6)
  })

  it('matches nothing for a payment that cannot be matched', () => {
    expect(possibleMatchFor(payment({ suggestedType: null }), [row()])).toBeNull()
    expect(possibleMatchFor(payment({ currency: 'USD' }), [row()])).toBeNull()
    expect(possibleMatchFor(payment({ amountCents: null }), [row()])).toBeNull()
  })
})
