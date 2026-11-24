import { describe, expect, it } from 'vitest'
import { buildMerchantIndex } from '../../domain/capture/review'
import { pushAt, arrivedAt, makeRecommendation, makeReviewModel } from '../../testing/reviewKit'
import { describeRecommendation, seedOf } from './reviewFields'
import { messageDateNotice, monthEdgeNotice } from './reviewNotice'

const model = makeReviewModel()
const merchants = buildMerchantIndex(model.dataset.transactions)
const notice = (over = {}) => monthEdgeNotice(describeRecommendation(makeRecommendation(over), model, merchants))

describe('monthEdgeNotice', () => {
  it('is nothing for an ordinary payment', () => {
    expect(notice()).toBeUndefined()
  })

  it('offers the day the push arrived on when that is another day', () => {
    const n = notice({
      localDate: '2026-11-30',
      occurredAt: pushAt(2026, 11, 30, 23, 52),
      createdAt: arrivedAt(2026, 12, 1, 0, 19),
    })!

    expect(n.original).toEqual({ date: '2026-11-30', label: 'Mon 30 Nov' })
    expect(n.alternate).toEqual({ date: '2026-12-01', label: 'Tue 1 Dec' })
    expect(n.text).toContain('dated Mon 30 Nov at 23:52')
    expect(n.text).toContain('The push arrived Tue 1 Dec at 00:19.')
    expect(n.text).toContain('Check the date and budget month before adding.')
    expect(n.text).toContain('Budget month edge.')
  })

  it('offers the next day when the push arrived the same day in the last hour of a month', () => {
    const n = notice({
      localDate: '2026-11-30',
      occurredAt: pushAt(2026, 11, 30, 23, 52),
      createdAt: arrivedAt(2026, 11, 30, 23, 53),
    })!

    expect(n.alternate.date).toBe('2026-12-01')
  })

  it('offers the day before in the first hour of a month, across a year end too', () => {
    const n = notice({
      localDate: '2027-01-01',
      occurredAt: pushAt(2027, 1, 1, 0, 10),
      createdAt: arrivedAt(2027, 1, 1, 0, 11),
    })!

    expect(n.alternate.date).toBe('2026-12-31')
  })

  it('still offers a day when the push time cannot be read', () => {
    const n = notice({ localDate: '2026-11-30', occurredAt: 'not a date', createdAt: 'nor this' })!

    expect(n.alternate.date).toBe('2026-12-01')
    expect(n.text).toContain('dated Mon 30 Nov.')
    expect(n.text).not.toContain('The push arrived')
  })
})

describe('messageDateNotice', () => {
  const view = (over = {}) => describeRecommendation(makeRecommendation(over), model, merchants)

  it('is nothing when the payment is dated the day its push arrived', () => {
    expect(messageDateNotice(view())).toBeUndefined()
  })

  it('says a charge the bank announced is still to come, and offers the day the push arrived', () => {
    const v = view({ localDate: '2026-12-01', occurredAt: pushAt(2026, 11, 30, 21, 32) })
    const n = messageDateNotice(v)!

    expect(n.text).toBe("The bank's message says it will be charged Tue 1 Dec. The push arrived Mon 30 Nov at 21:32.")
    expect(n.original).toEqual({ date: '2026-12-01', label: 'Tue 1 Dec' })
    expect(n.alternate).toEqual({ date: '2026-11-30', label: 'Mon 30 Nov' })
    // The form opens on the bank's day, in that day's budget month, with the note.
    const seed = seedOf(v)
    expect(seed.date).toBe('2026-12-01')
    expect(seed.budgetMonth).toBe('2026-12')
    expect(seed.notice).toEqual(n)
  })

  it('says money the bank announced will arrive, not be charged', () => {
    const v = view({ localDate: '2026-12-01', occurredAt: pushAt(2026, 11, 30, 21, 32), suggestedType: 'income' })

    expect(messageDateNotice(v)!.text).toBe(
      "The bank's message says it will arrive Tue 1 Dec. The push arrived Mon 30 Nov at 21:32.",
    )
  })

  it('says a late report dates the payment earlier', () => {
    const n = messageDateNotice(view({ localDate: '2026-11-20', occurredAt: pushAt(2026, 11, 23, 8, 5) }))!

    expect(n.text).toBe("The bank's message dates the payment Fri 20 Nov. The push arrived Mon 23 Nov at 08:05.")
  })

  it('asks nothing about a month edge for a day the bank wrote, even beside midnight', () => {
    const v = view({ localDate: '2026-12-01', occurredAt: pushAt(2026, 11, 30, 23, 55) })

    expect(v.edgeDays).toEqual([])
    expect(v.reasons).not.toContain('month-edge')
    expect(monthEdgeNotice(v)).toBeUndefined()
  })
})
