import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT } from './money'
import { rebaseline, rebaselineSummary } from './rebaselinePatch'

const events = [
  { year: 1, amountCents: 5_000_00, label: 'Bonus' },
  { year: 3, amountCents: -20_000_00, label: 'Car' },
]
const base = {
  lifeEvents: events,
  housePurchaseYear: 5,
  startInvestedCents: 100_000_00,
  monthlyContributionCents: 1_000_00,
  annualContributionGrowth: 0,
}
const plain = (iso: string) => iso

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

describe('rebaselineSummary', () => {
  const summary = (r: ReturnType<typeof rebaseline>) => rebaselineSummary(r, EU_MONEY_FORMAT, plain)

  it('says nothing when only the start changed', () => {
    const r = rebaseline({ ...base, lifeEvents: [], housePurchaseYear: null, planStartDate: '2024-09-11' }, { investedCents: 1, date: '2026-09-11' })
    expect(summary(r)).toEqual([])
  })

  it('names a dropped event with its date, since its money is already in the balance', () => {
    const r = rebaseline({ ...base, planStartDate: '2024-09-11' }, { investedCents: 1, date: '2026-09-11' })
    // The car keeps its date exactly (the new start's first anniversary), so it is not mentioned.
    expect(summary(r)).toEqual(['Bonus (2025-09-11) is already in the balance, so it is dropped.'])
  })

  it('gives the old and new date of an event that lands later, and why', () => {
    // Half a year in, each date lands on the next anniversary of the new start: six months later.
    const r = rebaseline({ ...base, planStartDate: '2026-01-01' }, { investedCents: 1, date: '2026-07-03' })
    expect(summary(r)).toEqual([
      'Bonus moves from 2027-01-01 to 2027-07-03.',
      'Car moves from 2029-01-01 to 2029-07-03.',
      'The house purchase moves from 2031-01-01 to 2031-07-03.',
      'Plan years are whole, so a later date lands on the next anniversary of the new start.',
    ])
  })

  it('says a house purchase now behind the start becomes a house owned from day one', () => {
    const r = rebaseline({ ...base, lifeEvents: [], planStartDate: '2020-01-01', housePurchaseYear: 2 }, { investedCents: 1, date: '2026-01-01' })
    expect(summary(r)).toEqual([
      'The house purchase (2022-01-01) is behind the new start, so the plan treats the house as owned from day one.',
    ])
  })

  it('says how far a growing contribution has grown, and what it replaces', () => {
    const r = rebaseline(
      { ...base, lifeEvents: [], housePurchaseYear: null, planStartDate: '2023-09-11', annualContributionGrowth: 0.05 },
      { investedCents: 1, date: '2026-09-11' },
    )
    expect(summary(r)).toEqual([
      'Monthly investing goes from 1.000,00 € to 1.157,63 €, as it has grown since the plan started.',
    ])
    expect(r.previous).toEqual({ investedCents: 100_000_00, planStartDate: '2023-09-11', monthlyContributionCents: 1_000_00 })
  })

  it('has no dates to give without an old start', () => {
    const r = rebaseline({ ...base, planStartDate: null }, { investedCents: 1, date: '2026-09-11' })
    expect(summary(r)).toEqual([])
    expect(r.carried).toEqual([])
  })
})
