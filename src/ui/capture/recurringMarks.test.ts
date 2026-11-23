import { describe, expect, it } from 'vitest'
import type { RecommendationInfo } from '../../data/recommendationsApi'
import { detectUpcoming } from '../../domain/engine/recurringUpcoming'
import { makeTransaction } from '../../testing/factories'
import { makeRecommendation, makeSeriesModel } from '../../testing/reviewKit'
import { buildExpenseModel } from '../buildExpenseModel'
import type { ExpenseModel } from '../useExpenseData'
import { pushesForCharges } from './recurringMarks'

const model = makeSeriesModel()
const keyOf = (description: string) => {
  const found = detectUpcoming(model.dataset.transactions, { today: '2026-11-14' }).find(
    (s) => s.description === description,
  )
  return found!.seriesKey
}

/** The charges the card offers on `today`, as it hands them over. */
const chargesOn = (
  today: string,
  on: ExpenseModel = model,
) => detectUpcoming(on.dataset.transactions, { today })

/** A push no history knows, so whatever names it comes from the series. Invented data. */
const push = (
  n: number,
  over: Partial<RecommendationInfo> = {},
) =>
  makeRecommendation({
    id: `0b0c0d0e-1111-4222-8333-44445555667${n}`,
    merchantRaw: 'PAYPROC*XY 77',
    amountCents: 1299,
    localDate: '2026-11-11',
    ...over,
  })

describe('pushesForCharges', () => {
  it('opens the push that is a charge, filled from its series, through its recommendation', () => {
    const seeds = pushesForCharges(chargesOn('2026-11-11'), model, [push(1)], {})

    expect([...seeds.keys()]).toEqual([keyOf('Video Stream')])
    expect(seeds.get(keyOf('Video Stream'))).toMatchObject({
      recommendationId: push(1).id,
      description: 'Video Stream',
      categoryId: 2,
      accountId: 1,
      amountCents: 1299,
      date: '2026-11-11',
      fromSeries: keyOf('Video Stream'),
    })
  })

  it('marks neither of two series a push fits', () => {
    const seeds = pushesForCharges(
      chargesOn('2026-11-14'),
      model,
      [push(1, { amountCents: 999, localDate: '2026-11-14' })],
      {},
    )

    expect(chargesOn('2026-11-14').map((c) => c.description)).toEqual(
      expect.arrayContaining(['Music Plan', 'Cloud Box']),
    )
    expect(seeds.size).toBe(0)
  })

  it('marks the other one when a push for one of the two names it by itself (a stopped series)', () => {
    const stopped = { [keyOf('Music Plan')]: { after: '2026-10-14' } }
    const seeds = pushesForCharges(
      chargesOn('2026-11-14'),
      model,
      [push(1, { amountCents: 999, localDate: '2026-11-14' })],
      stopped,
    )

    expect([...seeds.keys()]).toEqual([keyOf('Cloud Box')])
  })

  it('never marks a stopped series', () => {
    const stopped = { [keyOf('Video Stream')]: { after: '2026-10-10' } }

    expect(pushesForCharges(chargesOn('2026-11-11'), model, [push(1)], stopped).size).toBe(0)
  })

  it('never marks a series whose charge is already logged', () => {
    const logged = buildExpenseModel({
      ...model.dataset,
      transactions: [
        ...model.dataset.transactions,
        makeTransaction({
          id: 900,
          description: 'Video Stream',
          accountId: 1,
          categoryId: 2,
          amountCents: 1299,
          date: '2026-11-10',
        }),
      ],
    })

    // The card would not offer it either; handed the old charge anyway, the push still does not stand for it.
    expect(pushesForCharges(chargesOn('2026-11-11'), logged, [push(1)], {}).size).toBe(0)
  })

  it('marks only the charge on the usual date the push stands for', () => {
    const december = chargesOn('2026-11-11').map((c) =>
      c.description === 'Video Stream' ? { ...c, predictedDate: '2026-12-10' } : c,
    )

    expect(pushesForCharges(december, model, [push(1)], {}).size).toBe(0)
  })

  it('marks a series the push names on another account, keeping the push’s account for the form', () => {
    const seeds = pushesForCharges(chargesOn('2026-11-11'), model, [push(1, { accountId: 2 })], {})

    expect(seeds.get(keyOf('Video Stream'))).toMatchObject({ description: 'Video Stream', accountId: 2 })
  })

  it('wants the amount to the cent and the money moving the same way', () => {
    for (const over of [
      { amountCents: 1298 },
      { amountCents: 1300 },
      { amountCents: 1429 },
      { suggestedType: 'refund' as const },
    ]) {
      expect(pushesForCharges(chargesOn('2026-11-11'), model, [push(1, over)], {}).size).toBe(0)
    }
  })

  it('marks nothing while a model holding only some rows waits for its history', () => {
    const windowed: ExpenseModel = { ...model, sums: model.dataset }

    expect(pushesForCharges(chargesOn('2026-11-11'), windowed, [push(1)], {}).size).toBe(0)
  })
})
