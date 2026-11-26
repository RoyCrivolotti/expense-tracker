import { describe, expect, it } from 'vitest'
import type { RecommendationInfo } from '../../data/recommendationsApi'
import { buildMerchantIndex } from '../../domain/capture/review'
import { EU_MONEY_FORMAT } from '../../engine/money'
import { makeRecommendation, makeReviewModel, makeSeriesModel, pushAt } from '../../testing/reviewKit'
import { describeRecommendation } from './reviewFields'
import { introOf } from './reviewIntro'
import { seriesHintsOf } from './reviewSeries'
import { arrivedLabel, pairSentence, whyReasons, type PairSide } from './reviewWhy'

const TODAY = '2026-11-10'
const model = makeReviewModel()
const merchants = buildMerchantIndex(model.dataset.transactions)
const view = (over: Partial<RecommendationInfo> = {}) =>
  describeRecommendation(makeRecommendation(over), model, merchants)
const MOVEMENT = 'Example Bank alert: 43,80 EUR today'

/** A bill of 62,15 announced on 19 Nov for the 23rd, and its charge on the 23rd. Invented data. */
const notice = view({
  id: 'notice',
  merchantRaw: 'Heads up: 62,15 EUR is due next',
  amountCents: 6215,
  localDate: '2026-11-23',
  occurredAt: pushAt(2026, 11, 19, 10, 2),
})
const charge = view({
  id: 'charge',
  merchantRaw: 'EXAMPLE UTILITY',
  amountCents: 6215,
  localDate: '2026-11-23',
  occurredAt: pushAt(2026, 11, 23, 8, 10),
})
const asCharge: PairSide = { role: 'charge', other: notice }
const asNotice: PairSide = { role: 'announcement', other: charge }

describe('why a payment needs a look', () => {
  it('is nothing for a payment with nothing in doubt', () => {
    expect(whyReasons(view(), undefined, TODAY)).toEqual([])
  })

  it.each<[string, Partial<RecommendationInfo>, string]>([
    ['no merchant', { merchantRaw: MOVEMENT }, "the bank's message names no merchant"],
    ['no amount', { amountCents: null }, "the bank's message had no amount"],
    ['a zero amount', { amountCents: 0 }, 'the amount came through as zero'],
    ['another currency', { currency: 'USD' }, 'it is not in euros'],
    ['no direction', { suggestedType: null }, 'it looks like your own money moving, so the type is yours to pick'],
    ['an investment', { suggestedType: 'investment' }, 'it looks like an investment, which is yours to confirm'],
    ['no account', { accountId: null }, 'it has no account yet'],
    [
      'a card not linked',
      { accountId: null, card: { source: 'bank', digits: '0000' } },
      'the card is not linked to an account yet',
    ],
    [
      'a budget month edge',
      { localDate: '2026-10-31', occurredAt: pushAt(2026, 10, 31, 23, 48) },
      'it is close to the edge of a budget month',
    ],
  ])('says so for %s', (_name, over, sentence) => {
    expect(whyReasons(view(over), undefined, TODAY)).toContain(sentence)
  })

  it('says a new merchant has no category yet and is the first from this merchant, in that order', () => {
    expect(whyReasons(view({ merchantRaw: 'KIOSCO EJEMPLO' }), undefined, TODAY)).toEqual([
      'it has no category yet',
      'it is the first payment from this merchant',
    ])
  })

  it('says what the person’s history says: a new wording, a re-read amount, a name not settled', () => {
    const suggested = (
      reasons: Array<'new-shape' | 'amount-relearned'>,
      settled = true,
    ) =>
      view({
        suggestion: {
          description: 'Hardware shop',
          categoryId: 2,
          type: 'expense',
          accountId: 1,
          amountCents: 1250,
          sightings: 3,
          settled,
          reasons,
        },
      })
    expect(whyReasons(suggested(['new-shape']), undefined, TODAY)).toEqual([
      'the bank worded this message in a new way',
    ])
    expect(whyReasons(suggested(['amount-relearned']), undefined, TODAY)).toEqual([
      'the amount was read from another place in the message than before',
    ])
    expect(whyReasons(suggested([], false), undefined, TODAY)).toEqual([
      'you have named this merchant in more than one way',
    ])
  })

  it('says a bill the bank announced has not happened yet, until its day comes', () => {
    const later = view({ localDate: '2026-11-15', occurredAt: pushAt(2026, 11, 10, 10, 2) })
    expect(whyReasons(later, undefined, TODAY)).toEqual(['the bank announced it and it has not happened yet'])
    expect(whyReasons(later, undefined, '2026-11-15')).toEqual([])
  })

  it('puts the same-bill warning first', () => {
    expect(whyReasons(charge, asCharge, TODAY)[0]).toBe('it might be the same bill as another one waiting')
  })

  it('says what the monthly payments say: matched for the first time, or one of two', () => {
    const seriesModel = makeSeriesModel()
    const index = buildMerchantIndex(seriesModel.dataset.transactions)
    const read = (over: Partial<RecommendationInfo>) => {
      const rec = makeRecommendation({ merchantRaw: 'PAYPROC*XY 77', ...over })
      return describeRecommendation(rec, seriesModel, index, seriesHintsOf([rec], seriesModel, index, {}).get(rec.id))
    }
    expect(
      whyReasons(
        read({ amountCents: 1299, localDate: '2026-11-11', occurredAt: pushAt(2026, 11, 11) }),
        undefined,
        TODAY,
      ),
    ).toEqual(['it was matched to a monthly payment for the first time'])
    expect(
      whyReasons(
        read({ amountCents: 999, localDate: '2026-11-14', occurredAt: pushAt(2026, 11, 14) }),
        undefined,
        TODAY,
      ),
    ).toContain('it could be either of two monthly payments')
  })

  it('leaves a possible duplicate to the block that shows the entry', () => {
    const match = view({ possibleMatch: { transactionId: 7, description: 'Lunch', date: '2026-11-10' } })
    expect(match.reasons).toContain('possible-match')
    expect(whyReasons(match, undefined, TODAY)).toEqual([])
  })
})

describe('what the review view says about the other half of a pair', () => {
  it('tells the charge when the bank announced it, and to add this one', () => {
    expect(pairSentence(asCharge, EU_MONEY_FORMAT)).toBe(
      "Might be the same bill as the one the bank announced on Thu 19 Nov (−62,15 €, also waiting). If it's duplicated, add this one and choose Don't add on the other.",
    )
  })

  it('tells the announcement which charge, and to not add this one', () => {
    expect(pairSentence(asNotice, EU_MONEY_FORMAT)).toBe(
      "Might be the same bill as EXAMPLE UTILITY, −62,15 €, charged Mon 23 Nov and also waiting. If it's duplicated, choose Don't add here.",
    )
  })
})

describe('what the review view opens with', () => {
  it('says when the message arrived: the payment’s own time, or the arrival of a message that named another day', () => {
    expect(arrivedLabel(view())).toBe('Tue 10 Nov, 09:41')
    expect(arrivedLabel(notice)).toBe('Thu 19 Nov, 10:02')
    expect(arrivedLabel(view({ occurredAt: '2026-11-10T08:41:07Z' }))).toBe('Tue 10 Nov')
  })

  it('shows the push’s own text, cleaned, before the text the payment was read from', () => {
    const message = 'Card used: 12,50 EUR‮ for\n CAFE EXAMPLE'
    expect(introOf(view({ message }), undefined, EU_MONEY_FORMAT, TODAY).message).toBe(
      'Card used: 12,50 EUR for CAFE EXAMPLE',
    )
    expect(introOf(view({ message: null }), undefined, EU_MONEY_FORMAT, TODAY).message).toBe('CAFE EXAMPLE 0042')
    expect(introOf(view({ merchantRaw: null }), undefined, EU_MONEY_FORMAT, TODAY).message).toBeNull()
  })

  it('carries the reasons, and the pair sentence only for a pair', () => {
    const plain = introOf(view({ merchantRaw: MOVEMENT }), undefined, EU_MONEY_FORMAT, TODAY)
    expect(plain).toMatchObject({ arrived: 'Tue 10 Nov, 09:41', notes: [] })
    expect(plain.reasons[0]).toBe("the bank's message names no merchant")
    expect(plain).not.toHaveProperty('pair')

    expect(introOf(notice, asNotice, EU_MONEY_FORMAT, TODAY).pair).toMatch(/^Might be the same bill as EXAMPLE UTILITY/)
  })

  it('leaves out only the reason the duplicate block already says, and keeps the others', () => {
    const possibleMatch = { transactionId: 7, description: 'Lunch', date: '2026-11-10' }
    expect(introOf(view({ possibleMatch }), undefined, EU_MONEY_FORMAT, TODAY).reasons).toEqual([])
    expect(introOf(view({ possibleMatch, currency: 'USD' }), undefined, EU_MONEY_FORMAT, TODAY).reasons).toEqual([
      'it is not in euros',
    ])
  })
})
