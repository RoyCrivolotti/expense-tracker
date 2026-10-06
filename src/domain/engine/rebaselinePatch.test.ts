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
  contributionSchedule: [] as { from: string; monthlyCents: number }[],
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
      contributionSchedule: [],
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

describe('rebaseline with changes to the monthly amount', () => {
  const stepped = {
    ...base,
    lifeEvents: [],
    housePurchaseYear: null,
    planStartDate: '2026-01-01',
    contributionSchedule: [
      { from: '2026-07', monthlyCents: 1_500_00 },
      { from: '2028-03', monthlyCents: 2_500_00 },
      { from: '2030-01', monthlyCents: 0 },
    ],
  }

  it('restarts from the amount in force at the check-in and keeps the changes still to come, on their months', () => {
    const r = rebaseline(stepped, { investedCents: 1, date: '2027-02-15' })
    // July 2026 is behind the check-in; March 2028 and January 2030 are not.
    expect(r.patch.monthlyContributionCents).toBe(1_500_00)
    expect(r.patch.contributionSchedule).toEqual([
      { from: '2028-03', monthlyCents: 2_500_00 },
      { from: '2030-01', monthlyCents: 0 },
    ])
    expect(r.droppedSteps).toEqual([{ from: '2026-07', monthlyCents: 1_500_00 }])
  })

  it('grows the amount in force for the whole years since its month, not since the plan began', () => {
    // 1 July 2026 to 15 February 2028 is 1.6 years, so two years of 10% growth on 1,500.
    const r = rebaseline({ ...stepped, annualContributionGrowth: 0.1 }, { investedCents: 1, date: '2028-02-15' })
    expect(r.patch.monthlyContributionCents).toBe(Math.round(1_500_00 * 1.1 ** 2))
  })

  it('starts the changes later in the month of the check-in from the month itself', () => {
    const r = rebaseline(stepped, { investedCents: 1, date: '2028-03-20' })
    // A change takes effect on the first of its month, so by the 20th it is in force.
    expect(r.patch.monthlyContributionCents).toBe(2_500_00)
    expect(r.patch.contributionSchedule).toEqual([{ from: '2030-01', monthlyCents: 0 }])
    expect(r.droppedSteps.map((s) => s.from)).toEqual(['2026-07', '2028-03'])
  })

  it('is the base grown as before when no change has begun yet', () => {
    const r = rebaseline({ ...stepped, annualContributionGrowth: 0.05 }, { investedCents: 1, date: '2026-05-01' })
    expect(r.droppedSteps).toEqual([])
    expect(r.patch.monthlyContributionCents).toBe(1_000_00)
    expect(r.patch.contributionSchedule).toEqual(stepped.contributionSchedule)
  })

  it('leaves the changes alone without an old start, when none of them ever applied', () => {
    const r = rebaseline({ ...stepped, planStartDate: null }, { investedCents: 1, date: '2027-02-15' })
    expect(r.patch.monthlyContributionCents).toBe(1_000_00)
    expect(r.patch.contributionSchedule).toEqual(stepped.contributionSchedule)
    expect(r.droppedSteps).toEqual([])
  })

  it('does not touch the scenario it was given', () => {
    const before = JSON.stringify(stepped)
    rebaseline(stepped, { investedCents: 1, date: '2027-02-15' })
    expect(JSON.stringify(stepped)).toBe(before)
  })

  it('treats a scenario cached before the schedule existed as having none', () => {
    const { contributionSchedule: _omitted, ...cached } = stepped
    void _omitted
    const r = rebaseline(cached as typeof stepped, { investedCents: 1, date: '2027-02-15' })
    expect(r.patch.contributionSchedule).toEqual([])
    expect(r.droppedSteps).toEqual([])
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

  it('says which change the new monthly amount comes from, and that it is now part of it', () => {
    const r = rebaseline(
      {
        ...base,
        lifeEvents: [],
        housePurchaseYear: null,
        planStartDate: '2026-01-01',
        contributionSchedule: [{ from: '2026-07', monthlyCents: 1_500_00 }],
      },
      { investedCents: 1, date: '2027-02-15' },
    )
    expect(summary(r)).toEqual([
      'Monthly investing goes from 1.000,00 € to 1.500,00 €: the change to 1.500,00 € from 2026-07-01 is already behind the new start, so it is in the monthly amount.',
    ])
  })

  it('lists several changes that are behind the new start, in order', () => {
    const r = rebaseline(
      {
        ...base,
        lifeEvents: [],
        housePurchaseYear: null,
        planStartDate: '2026-01-01',
        contributionSchedule: [
          { from: '2026-07', monthlyCents: 1_500_00 },
          { from: '2027-01', monthlyCents: 2_000_00 },
        ],
      },
      { investedCents: 1, date: '2027-02-15' },
    )
    expect(summary(r)).toEqual([
      'Monthly investing goes from 1.000,00 € to 2.000,00 €: the change to 1.500,00 € from 2026-07-01, then 2.000,00 € from 2027-01-01 are already behind the new start, so they are in the monthly amount.',
    ])
  })

  it('has no dates to give without an old start', () => {
    const r = rebaseline({ ...base, planStartDate: null }, { investedCents: 1, date: '2026-09-11' })
    expect(summary(r)).toEqual([])
    expect(r.carried).toEqual([])
  })
})
