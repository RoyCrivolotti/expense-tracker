import { describe, expect, it } from 'vitest'
import { rebaseline } from './rebaselinePatch'
import { yearOffsetFromDate } from './wealthTracking'

const events = [
  { year: 1, amountCents: 5_000_00, label: 'Bonus' },
  { year: 3, amountCents: -20_000_00, label: 'Car' },
]

describe('rebaseline', () => {
  it('moves life events and the house purchase with the start, dropping what is now behind it', () => {
    const r = rebaseline(
      { planStartDate: '2024-09-11', lifeEvents: events, housePurchaseYear: 5 },
      { investedCents: 117_000_00, date: '2026-09-11' },
    )
    expect(r.shiftedYears).toBe(2)
    expect(r.patch).toEqual({
      startInvestedCents: 117_000_00,
      planStartDate: '2026-09-11',
      lifeEvents: [{ year: 1, amountCents: -20_000_00, label: 'Car' }],
      housePurchaseYear: 3,
    })
    expect(r.droppedLifeEvents).toEqual([events[0]])
  })

  it('folds a purchase now behind the start to owned from day one, and leaves never alone', () => {
    const r = rebaseline(
      { planStartDate: '2020-01-01', lifeEvents: [], housePurchaseYear: 2 },
      { investedCents: 1, date: '2026-01-01' },
    )
    expect(r.patch.housePurchaseYear).toBe(0)
    expect(
      rebaseline({ planStartDate: '2020-01-01', lifeEvents: [], housePurchaseYear: null }, { investedCents: 1, date: '2026-01-01' })
        .patch.housePurchaseYear,
    ).toBeNull()
  })

  it('shifts nothing without an old start date', () => {
    const r = rebaseline({ planStartDate: null, lifeEvents: events, housePurchaseYear: 5 }, { investedCents: 1, date: '2026-09-11' })
    expect(r.shiftedYears).toBe(0)
    expect(r.patch.lifeEvents).toEqual(events)
    expect(r.patch.housePurchaseYear).toBe(5)
    expect(r.droppedLifeEvents).toEqual([])
  })

  it('rounds the calendar distance to whole years, the same way the plan dates a year', () => {
    // Half a year and a day rounds up; a month short of it rounds down.
    const half = rebaseline({ planStartDate: '2026-01-01', lifeEvents: events, housePurchaseYear: null }, { investedCents: 1, date: '2026-07-03' })
    expect(half.shiftedYears).toBe(Math.round(yearOffsetFromDate('2026-01-01', '2026-07-03')!))
    expect(half.shiftedYears).toBe(1)
    const under = rebaseline({ planStartDate: '2026-01-01', lifeEvents: events, housePurchaseYear: null }, { investedCents: 1, date: '2026-06-01' })
    expect(under.shiftedYears).toBe(0)
    expect(under.patch.lifeEvents).toEqual(events)
  })

  it('moves events later when the latest check-in predates the old start', () => {
    const r = rebaseline({ planStartDate: '2027-01-01', lifeEvents: events, housePurchaseYear: 2 }, { investedCents: 1, date: '2026-01-01' })
    expect(r.shiftedYears).toBe(-1)
    expect(r.patch.lifeEvents.map((e) => e.year)).toEqual([2, 4])
    expect(r.patch.housePurchaseYear).toBe(3)
  })
})
