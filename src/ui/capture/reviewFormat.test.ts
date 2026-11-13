import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT } from '../../engine/money'
import { localInstant, makeRecommendation, makeReviewModel } from '../../testing/reviewKit'
import { buildMerchantIndex } from '../../domain/capture/review'
import { describeRecommendation } from './reviewFields'
import { detailLine, foreignAmount, monthWord, signedAmount, toastText, typeWord, weekdayDay } from './reviewFormat'

const model = makeReviewModel()
const merchants = buildMerchantIndex(model.dataset.transactions)
const view = (over = {}) => describeRecommendation(makeRecommendation(over), model, merchants)

describe('reviewFormat', () => {
  it('names the type, and says so when there is none', () => {
    expect(typeWord('income')).toBe('Income')
    expect(typeWord(null)).toBe('Type: pick one')
  })

  it('writes the weekday and the month from the payment, never a fixed date', () => {
    expect(weekdayDay('2026-12-01')).toBe('Tue 1 Dec')
    expect(weekdayDay('2026-11-10')).toBe('Tue 10 Nov')
    expect(monthWord('2026-12')).toBe('Dec')
  })

  it('signs the amount by type, and writes nothing for an unknown amount', () => {
    expect(signedAmount(view(), EU_MONEY_FORMAT)).toMatch(/^−/)
    expect(signedAmount(view({ suggestedType: 'income' }), EU_MONEY_FORMAT)).toMatch(/^\+/)
    expect(signedAmount(view({ suggestedType: 'refund' }), EU_MONEY_FORMAT)).toMatch(/^\+/)
    expect(signedAmount(view({ suggestedType: null }), EU_MONEY_FORMAT)).not.toMatch(/^[+−]/)
    expect(signedAmount(view({ amountCents: null }), EU_MONEY_FORMAT)).toBe('')
  })

  it('writes an amount in another currency with its own code', () => {
    expect(foreignAmount(view({ currency: 'USD', amountCents: 2000 }))).toBe('US$20.00')
    expect(foreignAmount(view({ currency: 'ABCD', amountCents: 2000 }))).toBe('20.00 ABCD')
    expect(foreignAmount(view({ currency: null, amountCents: null }))).toBe('0.00 ')
  })

  it('puts type, category, account, date and budget month on one line', () => {
    expect(detailLine(view())).toBe('Expense · Eating out · Main Debit · Tue 10 Nov · Nov budget')
  })

  it('says what is missing rather than leaving a gap', () => {
    expect(detailLine(view({ merchantRaw: 'BRAND NEW PLACE', accountId: null }))).toBe('Expense · No category · No account · Tue 10 Nov · Nov budget')
  })

  it('writes the toast with the action and amount first, and all seven fields in all', () => {
    const text = toastText('Added', view(), EU_MONEY_FORMAT)

    expect(text.split('\n')).toEqual([expect.stringMatching(/^Added · Cafe Example −/), 'Expense · Eating out · Main Debit · Tue 10 Nov · Nov budget'])
    expect(text).toContain('12')
  })

  it('does not leave a trailing space when the amount is unknown', () => {
    const text = toastText('Added', view({ amountCents: null, merchantRaw: null }), EU_MONEY_FORMAT)

    expect(text.split('\n')[0]).toBe('Added · Payment')
  })

  it('uses a mid-month push in the same way whatever the time of day', () => {
    expect(weekdayDay(view({ occurredAt: localInstant(2026, 11, 10, 3) }).date)).toBe('Tue 10 Nov')
  })
})
