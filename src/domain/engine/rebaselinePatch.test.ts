import { describe, expect, it } from 'vitest'
import { rebaseline } from './rebaselinePatch'

const events = [
  { year: 1, amountCents: 5_000_00, label: 'Bonus' },
  { year: 3, amountCents: -20_000_00, label: 'Car' },
]
const base = { lifeEvents: events, housePurchaseYear: 5, monthlyContributionCents: 1_000_00, annualContributionGrowth: 0 }

describe('rebaseline', () => {
  it('moves life events and the house purchase with the start, dropping what is now behind it', () => {
    const r = rebaseline({ ...base, planStartDate: '2024-09-11' }, { investedCents: 117_000_00, date: '2026-09-11' })
    expect(r.shiftedYears).toBe(2)
    expect(r.patch).toEqual({
      startInvestedCents: 117_000_00,
      planStartDate: '2026-09-11',
      lifeEvents: [{ year: 1, amountCents: -20_000_00, label: 'Car' }],
      housePurchaseYear: 3,
      monthlyContributionCents: 1_000_00,
    })
    expect(r.droppedLifeEvents).toEqual([events[0]])
  })

  it('keeps an event still ahead of the check-in, on the first plan year at or after its date', () => {
    // Half a year in: the year-1 bonus is six months away, not behind the new start.
    const r = rebaseline({ ...base, planStartDate: '2026-01-01' }, { investedCents: 1, date: '2026-07-03' })
    expect(r.droppedLifeEvents).toEqual([])
    expect(r.patch.lifeEvents.map((e) => e.year)).toEqual([1, 3])
    expect(r.patch.housePurchaseYear).toBe(5)
    // One day after the event's own date, it is gone.
    const after = rebaseline({ ...base, planStartDate: '2026-01-01' }, { investedCents: 1, date: '2027-01-02' })
    expect(after.droppedLifeEvents).toEqual([events[0]])
    expect(after.patch.lifeEvents.map((e) => e.year)).toEqual([2])
  })

  it('folds a purchase now on or behind the start to owned from day one, and leaves never alone', () => {
    const r = rebaseline({ ...base, planStartDate: '2020-01-01', housePurchaseYear: 2 }, { investedCents: 1, date: '2026-01-01' })
    expect(r.patch.housePurchaseYear).toBe(0)
    expect(
      rebaseline({ ...base, planStartDate: '2020-01-01', housePurchaseYear: null }, { investedCents: 1, date: '2026-01-01' })
        .patch.housePurchaseYear,
    ).toBeNull()
  })

  it('restarts a growing contribution from where the years took it', () => {
    const r = rebaseline(
      { ...base, planStartDate: '2023-09-11', annualContributionGrowth: 0.05 },
      { investedCents: 1, date: '2026-09-11' },
    )
    expect(r.shiftedYears).toBe(3)
    expect(r.patch.monthlyContributionCents).toBe(Math.round(1_000_00 * 1.05 ** 3))
  })

  it('shifts nothing without an old start date', () => {
    const r = rebaseline({ ...base, planStartDate: null }, { investedCents: 1, date: '2026-09-11' })
    expect(r.shiftedYears).toBe(0)
    expect(r.patch.lifeEvents).toEqual(events)
    expect(r.patch.housePurchaseYear).toBe(5)
    expect(r.patch.monthlyContributionCents).toBe(1_000_00)
    expect(r.droppedLifeEvents).toEqual([])
  })

  it('moves events later when the latest check-in predates the old start', () => {
    const r = rebaseline({ ...base, planStartDate: '2027-01-01', housePurchaseYear: 2 }, { investedCents: 1, date: '2026-01-01' })
    expect(r.shiftedYears).toBe(-1)
    expect(r.patch.lifeEvents.map((e) => e.year)).toEqual([2, 4])
    expect(r.patch.housePurchaseYear).toBe(3)
  })
})
