import { describe, expect, it } from 'vitest'
import type { RecommendationInfo } from '../../data/recommendationsApi'
import { buildMerchantIndex } from '../../domain/capture/review'
import { makeRecommendation, makeReviewModel, pushAt } from '../../testing/reviewKit'
import { describeRecommendation } from './reviewFields'
import { billPairs, pairSides, tiedOrder, totalsOf } from './reviewPairs'

const model = makeReviewModel()
const merchants = buildMerchantIndex(model.dataset.transactions)
const view = (
  id: string,
  over: Partial<RecommendationInfo> = {},
) => describeRecommendation(makeRecommendation({ id, ...over }), model, merchants)

/** A bill of 62,15 announced on the 19th for the 23rd. Invented data. */
const notice = (over: Partial<RecommendationInfo> = {}) =>
  view('notice', { amountCents: 6215, localDate: '2026-11-23', occurredAt: pushAt(2026, 11, 19, 10, 2), ...over })
const charge = (over: Partial<RecommendationInfo> = {}) =>
  view('charge', { amountCents: 6215, localDate: '2026-11-23', occurredAt: pushAt(2026, 11, 23, 8, 10), ...over })
const coffee = view('coffee', { amountCents: 340, localDate: '2026-11-25', occurredAt: pushAt(2026, 11, 25) })
const market = view('market', { amountCents: 2399, localDate: '2026-11-22', occurredAt: pushAt(2026, 11, 22) })

const ids = (views: readonly { rec: { id: string } }[]) => views.map((v) => v.rec.id)

describe('the waiting payments, with a bill that waits twice', () => {
  it('finds the pair whichever of the two the list gives first', () => {
    expect(billPairs([coffee, charge(), notice(), market])).toEqual([{ announcement: 'notice', charge: 'charge' }])
    expect(billPairs([coffee, notice(), charge(), market])).toEqual([{ announcement: 'notice', charge: 'charge' }])
    expect(billPairs([coffee, market])).toEqual([])
  })

  it('reads the amount and type the person sees, not the push’s first reading', () => {
    const reread = charge({
      amountCents: 100,
      suggestion: {
        description: null,
        categoryId: null,
        type: 'expense',
        accountId: 1,
        amountCents: 6215,
        sightings: 0,
        settled: false,
        reasons: ['amount-relearned'],
      },
    })
    expect(billPairs([notice(), reread])).toHaveLength(1)
    expect(billPairs([notice(), charge({ amountCents: 100 })])).toEqual([])
  })

  it('puts the announcement right under its charge, wherever the list had it, and moves nothing else', () => {
    const late = charge({ localDate: '2026-11-26', occurredAt: pushAt(2026, 11, 26, 8, 10) })
    for (const listed of [
      [late, coffee, notice(), market],
      [notice(), late, coffee, market],
      [coffee, market, notice(), late],
    ]) {
      const order = ids(tiedOrder(listed, billPairs(listed)))
      expect(order.indexOf('notice')).toBe(order.indexOf('charge') + 1)
      expect(order.filter((id) => id === 'coffee' || id === 'market')).toEqual(['coffee', 'market'])
      expect(order).toHaveLength(4)
    }
    expect(ids(tiedOrder([coffee, market], []))).toEqual(['coffee', 'market'])
  })

  it('tells each of the two which it is, and gives it the other', () => {
    const listed = [coffee, charge(), notice()]
    const sides = pairSides(listed, billPairs(listed))
    expect(sides.get('charge')).toMatchObject({ role: 'charge', other: { rec: { id: 'notice' } } })
    expect(sides.get('notice')).toMatchObject({ role: 'announcement', other: { rec: { id: 'charge' } } })
    expect(sides.has('coffee')).toBe(false)
  })

  it('adds the bill up once: with the pair 62,15 + 3,40 + 23,99 go out, not 62,15 twice', () => {
    const listed = [coffee, charge(), notice(), market]
    expect(totalsOf(listed, billPairs(listed))).toEqual({ inCents: 0, outCents: 6215 + 340 + 2399 })
    expect(totalsOf(listed, [])).toEqual({ inCents: 0, outCents: 6215 + 6215 + 340 + 2399 })
  })

  it('adds an announced bill not yet charged, when its charge is not waiting too', () => {
    expect(totalsOf([coffee, notice()], billPairs([coffee, notice()]))).toEqual({ inCents: 0, outCents: 6215 + 340 })
  })
})
