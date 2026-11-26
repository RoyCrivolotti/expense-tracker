import { describe, expect, it } from 'vitest'
import { ANNOUNCED_CHARGE_DAYS } from './duplicate'
import { sameBillPairs, type WaitingPayment } from './pairs'

/** A bill of 62,15 the bank announced on 19 Nov for the 23rd. Invented data. */
const announcement = (over: Partial<WaitingPayment> = {}): WaitingPayment => ({
  id: 'announcement',
  amountCents: 6215,
  currency: 'EUR',
  suggestedType: 'expense',
  occurredAt: '2026-11-19T10:02:00+01:00',
  localDate: '2026-11-23',
  ...over,
})

/** Its charge, reported on the day it happened. */
const charge = (over: Partial<WaitingPayment> = {}): WaitingPayment => ({
  id: 'charge',
  amountCents: 6215,
  currency: 'EUR',
  suggestedType: 'expense',
  occurredAt: '2026-11-23T08:10:00+01:00',
  localDate: '2026-11-23',
  ...over,
})

const PAIR = [{ announcement: 'announcement', charge: 'charge' }]

describe('the same bill waiting twice', () => {
  it('pairs an announcement with its charge, whichever comes first in the list', () => {
    expect(sameBillPairs([announcement(), charge()])).toEqual(PAIR)
    expect(sameBillPairs([charge(), announcement()])).toEqual(PAIR)
  })

  it('takes a charge on the named day and up to a week after it, and none before or later', () => {
    const on = (day: string) => charge({ localDate: day, occurredAt: `${day}T08:10:00+01:00` })
    expect(ANNOUNCED_CHARGE_DAYS).toBe(7)
    expect(sameBillPairs([announcement(), on('2026-11-23')])).toEqual(PAIR)
    expect(sameBillPairs([announcement(), on('2026-11-30')])).toEqual(PAIR)
    expect(sameBillPairs([announcement(), on('2026-12-01')])).toEqual([])
    expect(sameBillPairs([announcement(), on('2026-11-22')])).toEqual([])
  })

  it('needs the announcement to have arrived first', () => {
    const lateNotice = announcement({ occurredAt: '2026-11-23T09:00:00+01:00', localDate: '2026-11-24' })
    const early = charge({ localDate: '2026-11-24', occurredAt: '2026-11-23T08:10:00+01:00' })
    expect(sameBillPairs([lateNotice, early])).toEqual([])
  })

  it('needs the same amount to the cent', () => {
    expect(sameBillPairs([announcement(), charge({ amountCents: 6216 })])).toEqual([])
    expect(sameBillPairs([announcement({ amountCents: 6214 }), charge()])).toEqual([])
  })

  it('needs money moving the same way', () => {
    expect(sameBillPairs([announcement(), charge({ suggestedType: 'income' })])).toEqual([])
    expect(sameBillPairs([announcement({ suggestedType: 'refund' }), charge({ suggestedType: 'income' })])).toEqual(
      PAIR,
    )
    expect(sameBillPairs([announcement(), charge({ suggestedType: 'investment' })])).toEqual(PAIR)
  })

  it('leaves out what cannot be compared: another currency, no amount, zero, no direction', () => {
    for (const odd of [
      { currency: 'USD' },
      { amountCents: null },
      { amountCents: 0 },
      { suggestedType: null },
    ] satisfies Partial<WaitingPayment>[]) {
      expect(sameBillPairs([announcement(odd), charge(odd)])).toEqual([])
    }
    expect(sameBillPairs([announcement({ currency: null }), charge({ currency: null })])).toEqual(PAIR)
  })

  it('keeps two charges of one price apart, and two announcements', () => {
    expect(sameBillPairs([charge(), charge({ id: 'second', occurredAt: '2026-11-23T19:00:00+01:00' })])).toEqual([])
    expect(sameBillPairs([announcement(), announcement({ id: 'second' })])).toEqual([])
  })

  it('puts a payment in one pair only, with the charge closest to the named day', () => {
    const later = charge({ id: 'later', localDate: '2026-11-25', occurredAt: '2026-11-25T08:00:00+01:00' })
    expect(sameBillPairs([later, announcement(), charge()])).toEqual(PAIR)
    expect(sameBillPairs([charge(), later, announcement()])).toEqual(PAIR)

    const second = announcement({ id: 'second', occurredAt: '2026-11-20T10:00:00+01:00', localDate: '2026-11-25' })
    expect(sameBillPairs([announcement(), second, charge(), later])).toEqual([
      ...PAIR,
      { announcement: 'second', charge: 'later' },
    ])
  })

  it('does not take a row in UTC, which has no phone day, for an announcement', () => {
    expect(sameBillPairs([announcement({ occurredAt: '2026-11-19T09:02:00Z' }), charge()])).toEqual([])
  })
})
