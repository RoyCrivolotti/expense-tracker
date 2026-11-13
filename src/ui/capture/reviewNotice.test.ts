import { describe, expect, it } from 'vitest'
import { buildMerchantIndex } from '../../domain/capture/review'
import { pushAt, arrivedAt, makeRecommendation, makeReviewModel } from '../../testing/reviewKit'
import { describeRecommendation } from './reviewFields'
import { monthEdgeNotice } from './reviewNotice'

const model = makeReviewModel()
const merchants = buildMerchantIndex(model.dataset.transactions)
const notice = (over = {}) => monthEdgeNotice(describeRecommendation(makeRecommendation(over), model, merchants))

describe('monthEdgeNotice', () => {
  it('is nothing for an ordinary payment', () => {
    expect(notice()).toBeUndefined()
  })

  it('offers the day the push arrived on when that is another day', () => {
    const n = notice({ localDate: '2026-11-30', occurredAt: pushAt(2026, 11, 30, 23, 52), createdAt: arrivedAt(2026, 12, 1, 0, 19) })!

    expect(n.original).toEqual({ date: '2026-11-30', label: 'Mon 30 Nov' })
    expect(n.alternate).toEqual({ date: '2026-12-01', label: 'Tue 1 Dec' })
    expect(n.text).toContain('dated Mon 30 Nov at 23:52')
    expect(n.text).toContain('The push arrived Tue 1 Dec at 00:19.')
    expect(n.text).toContain('Check the date and budget month before adding.')
    expect(n.text).toContain('Budget month edge.')
  })

  it('offers the next day when the push arrived the same day in the last hour of a month', () => {
    const n = notice({ localDate: '2026-11-30', occurredAt: pushAt(2026, 11, 30, 23, 52), createdAt: arrivedAt(2026, 11, 30, 23, 53) })!

    expect(n.alternate.date).toBe('2026-12-01')
  })

  it('offers the day before in the first hour of a month, across a year end too', () => {
    const n = notice({ localDate: '2027-01-01', occurredAt: pushAt(2027, 1, 1, 0, 10), createdAt: arrivedAt(2027, 1, 1, 0, 11) })!

    expect(n.alternate.date).toBe('2026-12-31')
  })

  it('still offers a day when the push time cannot be read', () => {
    const n = notice({ localDate: '2026-11-30', occurredAt: 'not a date', createdAt: 'nor this' })!

    expect(n.alternate.date).toBe('2026-12-01')
    expect(n.text).toContain('dated Mon 30 Nov.')
    expect(n.text).not.toContain('The push arrived')
  })
})
