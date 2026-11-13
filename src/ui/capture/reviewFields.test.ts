import { describe, expect, it } from 'vitest'
import { pushAt, arrivedAt, makeRecommendation, makeReviewModel } from '../../testing/reviewKit'
import { buildMerchantIndex } from '../../domain/capture/review'
import { buildExpenseModel } from '../buildExpenseModel'
import { describeRecommendation, seedOf, transactionOf } from './reviewFields'

const model = makeReviewModel()
const merchants = buildMerchantIndex(model.dataset.transactions)
const view = (over = {}) => describeRecommendation(makeRecommendation(over), model, merchants)

describe('describeRecommendation', () => {
  it('fills all seven fields for a known merchant and allows one tap', () => {
    const v = view()

    expect(v).toMatchObject({
      type: 'expense',
      amountCents: 1250,
      description: 'Cafe Example',
      fromHistory: true,
      categoryId: 1,
      categoryName: 'Eating out',
      accountId: 1,
      accountName: 'Main Debit',
      date: '2026-11-10',
      budgetMonth: '2026-11',
      reasons: [],
      oneTap: true,
    })
    expect(v.time).toMatch(/^\d\d:\d\d$/)
  })

  it('computes the budget month from the payment, never a fixed one', () => {
    expect(view({ localDate: '2026-09-14', occurredAt: pushAt(2026, 9, 14), createdAt: arrivedAt(2026, 9, 14) }).budgetMonth).toBe('2026-09')
  })

  it('wants a look at a merchant seen once, and shows the bank text as its name', () => {
    const v = view({ merchantRaw: 'ONCE SHOP 12' })

    expect(v.reasons).toContain('new-merchant')
    expect(v.oneTap).toBe(false)
  })

  it('wants a look at a merchant never seen, with no category', () => {
    const v = view({ merchantRaw: 'BRAND NEW PLACE' })

    expect(v.reasons).toEqual(['no-category', 'new-merchant'])
    expect(v.description).toBe('BRAND NEW PLACE')
    expect(v.fromHistory).toBe(false)
  })

  it('does not use a category that is no longer in use', () => {
    const v = view({ merchantRaw: 'ARCHIVE SHOP' })

    expect(v.categoryId).toBeNull()
    expect(v.categoryName).toBeNull()
    expect(v.reasons).toContain('no-category')
  })

  it('wants a look when the card is not mapped to an account, or maps to one that is gone', () => {
    expect(view({ accountId: null }).reasons).toContain('no-account')
    expect(view({ accountId: 99 }).reasons).toContain('no-account')
  })

  it('wants a look with no merchant text, no amount, another currency, or no suggested type', () => {
    expect(view({ merchantRaw: null }).reasons).toContain('no-merchant')
    expect(view({ merchantRaw: '  ' }).reasons).toContain('no-merchant')
    expect(view({ amountCents: null }).reasons).toContain('no-amount')
    expect(view({ currency: 'USD' }).reasons).toContain('foreign')
    expect(view({ suggestedType: null }).reasons).toContain('own-money')
  })

  it('wants a look near the end of a month and when the push arrived in a later month', () => {
    expect(view({ localDate: '2026-11-30', occurredAt: pushAt(2026, 11, 30, 23, 52), createdAt: arrivedAt(2026, 11, 30, 23, 53) }).reasons).toContain('month-edge')
    expect(view({ localDate: '2026-11-30', occurredAt: pushAt(2026, 11, 30, 18), createdAt: arrivedAt(2026, 12, 1, 0, 19) }).reasons).toContain('month-edge')
  })

  it('has no clock for a row written in UTC: next to a month end it wants a look, in mid-month it does not', () => {
    const utc = (localDate: string) => view({ localDate, occurredAt: `${localDate}T22:52:07.000Z` })

    expect(utc('2026-11-30').reasons).toContain('month-edge')
    expect(utc('2026-11-30').time).toBeNull()
    expect(utc('2026-11-15').reasons).not.toContain('month-edge')
  })

  it("reads the payment's own time, so it does not depend on the zone of this device", () => {
    const v = view({ localDate: '2026-11-30', occurredAt: pushAt(2026, 11, 30, 23, 30), createdAt: arrivedAt(2026, 11, 30, 23, 31) })

    expect(v.time).toBe('23:30')
    expect(v.clock.minuteOfDay).toBe(23 * 60 + 30)
    expect(v.edgeDays).toEqual(['2026-12-01'])
  })

  it('follows the rollover day setting: the evening before it is a budget month edge and the calendar month end is not', () => {
    const rollover = buildExpenseModel({ ...model.dataset, settings: { ...model.dataset.settings, budgetRolloverDay: 15 } })
    const at = (day: number) => describeRecommendation(makeRecommendation({ localDate: `2026-11-${day}`, occurredAt: pushAt(2026, 11, day, 23, 30), createdAt: arrivedAt(2026, 11, day, 23, 31) }), rollover, merchants)

    expect(at(14).reasons).toContain('month-edge')
    expect(at(14).edgeDays).toEqual(['2026-11-15'])
    expect(at(30).reasons).not.toContain('month-edge')
  })

  it('takes the budget month from the same rule for the payment day and the day an hour away', () => {
    const v = view({ localDate: '2026-12-31', occurredAt: pushAt(2026, 12, 31, 23, 30), createdAt: arrivedAt(2026, 12, 31, 23, 31) })

    expect(v.budgetMonth).toBe('2026-12')
    expect(v.edgeDays).toEqual(['2027-01-01'])
  })

  it('wants a look, and not one tap, when the server says a typed row looks the same', () => {
    const v = view({ possibleMatch: { id: 9, description: 'Cafe', date: '2026-11-09' } })

    expect(v.reasons).toEqual(['possible-match'])
    expect(v.oneTap).toBe(false)
  })

  it('leaves the time out when the push time cannot be read', () => {
    expect(view({ occurredAt: 'not a date', createdAt: 'nor this' }).time).toBeNull()
  })
})

describe('seedOf', () => {
  it('carries what is known, and the recommendation to settle', () => {
    expect(seedOf(view())).toEqual({
      recommendationId: '0b0c0d0e-1111-4222-8333-444455556661',
      date: '2026-11-10',
      budgetMonth: '2026-11',
      amountCents: 1250,
      type: 'expense',
      description: 'Cafe Example',
      accountId: 1,
      categoryId: 1,
    })
  })

  it('leaves out what is not known: no description from bank text, no euros from another currency, no type for own money', () => {
    const seed = seedOf(view({ merchantRaw: 'BRAND NEW PLACE', currency: 'USD', suggestedType: null, accountId: null }))

    expect(seed).toEqual({ recommendationId: '0b0c0d0e-1111-4222-8333-444455556661', date: '2026-11-10', budgetMonth: '2026-11' })
  })

  it('carries the month-end note for a payment near a month end, and none otherwise', () => {
    const edge = seedOf(view({ localDate: '2026-11-30', occurredAt: pushAt(2026, 11, 30, 23, 52), createdAt: arrivedAt(2026, 11, 30, 23, 53) }))

    expect(edge.notice?.alternate.date).toBe('2026-12-01')
    expect(seedOf(view())).not.toHaveProperty('notice')
  })

  it('leaves out an amount the push did not have', () => {
    expect(seedOf(view({ amountCents: null }))).not.toHaveProperty('amountCents')
  })
})

describe('one tap is never a no-op', () => {
  it('for every suggested type and amount, a payment is either added as a real row or sent to Review', () => {
    for (const suggestedType of ['expense', 'income', 'refund', 'investment', null] as const) {
      for (const amountCents of [null, 0, 1250]) {
        const v = view({ suggestedType, amountCents })
        expect(transactionOf(v) !== null, `${suggestedType} ${amountCents}`).toBe(v.oneTap)
      }
    }
  })

  it('sends an investment and a zero amount to Review with a reason that says so', () => {
    expect(view({ suggestedType: 'investment' }).reasons).toEqual(['own-money'])
    expect(view({ amountCents: 0 }).reasons).toEqual(['zero-amount'])
  })
})

describe('transactionOf', () => {
  it('is the exact transaction one tap adds', () => {
    expect(transactionOf(view())).toEqual({
      date: '2026-11-10',
      budgetMonth: '2026-11',
      description: 'Cafe Example',
      accountId: 1,
      categoryId: 1,
      type: 'expense',
      amountCents: 1250,
      cancelled: false,
      flagId: null,
    })
  })

  it('is null for any payment in doubt, so one tap cannot add it', () => {
    expect(transactionOf(view({ merchantRaw: 'BRAND NEW PLACE' }))).toBeNull()
    expect(transactionOf(view({ possibleMatch: { id: 9, description: 'Cafe', date: '2026-11-09' } }))).toBeNull()
    expect(transactionOf(view({ currency: 'USD' }))).toBeNull()
  })

  it('is null for an investment, which a person picks and one tap never suggests', () => {
    const v = { ...view(), type: 'investment' as const }

    expect(transactionOf(v)).toBeNull()
  })
})
