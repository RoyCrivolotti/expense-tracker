import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT } from '../../engine/money'
import { makeRecommendation, makeReviewModel, pushAt } from '../../testing/reviewKit'
import { buildMerchantIndex } from '../../domain/capture/review'
import { describeRecommendation } from './reviewFields'
import {
  detailLine,
  foreignAmount,
  monthWord,
  signedAmount,
  toastText,
  totalChips,
  typeWord,
  weekdayDay,
} from './reviewFormat'

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

  it('signs the amount by the way the money moves, and writes nothing for an unknown amount', () => {
    expect(signedAmount(view(), EU_MONEY_FORMAT)).toBe('−12,50 €')
    expect(signedAmount(view({ suggestedType: 'investment' }), EU_MONEY_FORMAT)).toBe('−12,50 €')
    expect(signedAmount(view({ suggestedType: 'income' }), EU_MONEY_FORMAT)).toBe('+12,50 €')
    expect(signedAmount(view({ suggestedType: 'refund' }), EU_MONEY_FORMAT)).toBe('+12,50 €')
    expect(signedAmount(view({ suggestedType: null }), EU_MONEY_FORMAT)).toBe('12,50 €')
    expect(signedAmount(view({ amountCents: 0 }), EU_MONEY_FORMAT)).toBe('0,00 €')
    expect(signedAmount(view({ amountCents: null }), EU_MONEY_FORMAT)).toBe('')
  })

  it('writes an amount not in euros in its own currency, with its sign', () => {
    expect(signedAmount(view({ currency: 'USD', amountCents: 1820 }), EU_MONEY_FORMAT)).toBe('−US$18.20')
    expect(signedAmount(view({ currency: 'GBP', amountCents: 500, suggestedType: 'income' }), EU_MONEY_FORMAT)).toBe(
      '+£5.00',
    )
  })

  it('writes six and eight digits in full, grouped', () => {
    expect(signedAmount(view({ amountCents: 12345678, suggestedType: 'income' }), EU_MONEY_FORMAT)).toBe(
      '+123.456,78 €',
    )
    expect(signedAmount(view({ amountCents: 25000000 }), EU_MONEY_FORMAT)).toBe('−250.000,00 €')
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
    expect(detailLine(view({ merchantRaw: 'BRAND NEW PLACE', accountId: null }))).toBe(
      'Expense · No category · No account · Tue 10 Nov · Nov budget',
    )
  })

  it('writes the toast with the action and amount first, and all seven fields in all', () => {
    const text = toastText('Added', view(), EU_MONEY_FORMAT)

    expect(text.split('\n')).toEqual([
      expect.stringMatching(/^Added · Cafe Example −/),
      'Expense · Eating out · Main Debit · Tue 10 Nov · Nov budget',
    ])
    expect(text).toContain('12')
  })

  it('does not leave a trailing space when the amount is unknown', () => {
    const text = toastText('Added', view({ amountCents: null, merchantRaw: null }), EU_MONEY_FORMAT)

    expect(text.split('\n')[0]).toBe('Added · Unnamed payment')
  })

  it('uses a mid-month push in the same way whatever the time of day', () => {
    expect(weekdayDay(view({ occurredAt: pushAt(2026, 11, 10, 3) }).date)).toBe('Tue 10 Nov')
  })
})

describe('the totals on the card’s one line', () => {
  const texts = (
    inCents: number,
    outCents: number,
  ) => totalChips({ inCents, outCents }, EU_MONEY_FORMAT).map((chip) => `${chip.way} ${chip.text}`)

  it('shows money in, then money out, in whole euros with their signs', () => {
    expect(texts(185000, 17364)).toEqual(['in +1.850 €', 'out −174 €'])
  })

  it('has no chip for a side where nothing moves', () => {
    expect(texts(0, 17300)).toEqual(['out −173 €'])
    expect(texts(185000, 0)).toEqual(['in +1.850 €'])
    expect(texts(0, 0)).toEqual([])
  })

  it('rounds at the half euro, upwards', () => {
    expect(texts(149, 150)).toEqual(['in +1 €', 'out −2 €'])
    expect(texts(17349, 17350)).toEqual(['in +173 €', 'out −174 €'])
  })

  it('has no chip for a sum under half a euro, which would read as zero', () => {
    expect(texts(49, 50)).toEqual(['out −1 €'])
    expect(texts(1, 49)).toEqual([])
  })

  it('writes six digits and more in full', () => {
    expect(texts(12345678, 25000000)).toEqual(['in +123.457 €', 'out −250.000 €'])
    expect(texts(99999950, 123456789012)).toEqual(['in +1.000.000 €', 'out −1.234.567.890 €'])
  })

  it('says which way each goes to a screen reader, and follows the person’s number format', () => {
    expect(totalChips({ inCents: 100, outCents: 100 }, EU_MONEY_FORMAT).map((chip) => chip.spoken)).toEqual([
      'coming in',
      'going out',
    ])
    const dollars = { locale: 'en-US', symbol: '$', symbolPosition: 'prefix', decimalSeparator: '.' } as const
    expect(totalChips({ inCents: 185000, outCents: 0 }, dollars)[0]!.text).toBe('+$1,850')
  })
})
