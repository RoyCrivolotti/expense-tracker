import { describe, expect, it } from 'vitest'
import {
  CONTRIBUTION_STEP_MAX_CENTS,
  CONTRIBUTION_STEP_MAX_COUNT,
  annualContributionCents,
  foldChangesAtOrBefore,
  monthlyCentsAt,
  nextContributionStep,
  normalizeContributionSchedule,
  parseContributionSchedule,
  plannedMonthlyAt,
  plannedMonthlyAverage,
  scheduleSteps,
  validateContributionSchedule,
} from './contributionSchedule'
import { projectNetWorth } from './projection'
import { scenarioToParams } from './scenarioProjection'
import { DEFAULT_INFLATION_RATE } from './projectionConstants'
import { makeScenario } from '../../testing/factories'

const B = 1_000_00 // 1,000 a month
const X = 2_000_00 // 2,000 a month

describe('validateContributionSchedule', () => {
  it('accepts none, and a list of steps in any order', () => {
    expect(validateContributionSchedule([])).toBeNull()
    expect(
      validateContributionSchedule([
        { from: '2028-03', monthlyCents: 250_000 },
        { from: '2027-01', monthlyCents: 0 },
      ]),
    ).toBeNull()
  })

  it('refuses anything that is not a list of {from: YYYY-MM, monthlyCents: whole cents}', () => {
    expect(validateContributionSchedule(null)).toMatch(/array/)
    expect(validateContributionSchedule({})).toMatch(/array/)
    expect(validateContributionSchedule(['2027-01'])).toMatch(/object/)
    expect(validateContributionSchedule([null])).toMatch(/object/)
    expect(validateContributionSchedule([{ from: '2027-1', monthlyCents: 1 }])).toMatch(/YYYY-MM/)
    expect(validateContributionSchedule([{ from: '2027-13', monthlyCents: 1 }])).toMatch(/YYYY-MM/)
    expect(validateContributionSchedule([{ from: '2027-01-15', monthlyCents: 1 }])).toMatch(/YYYY-MM/)
    expect(validateContributionSchedule([{ from: 202701, monthlyCents: 1 }])).toMatch(/YYYY-MM/)
    expect(validateContributionSchedule([{ from: '2027-01', monthlyCents: -1 }])).toMatch(/monthlyCents/)
    expect(validateContributionSchedule([{ from: '2027-01', monthlyCents: 1.5 }])).toMatch(/monthlyCents/)
    expect(validateContributionSchedule([{ from: '2027-01', monthlyCents: '10' }])).toMatch(/monthlyCents/)
    expect(
      validateContributionSchedule([{ from: '2027-01', monthlyCents: CONTRIBUTION_STEP_MAX_CENTS + 1 }]),
    ).toMatch(/monthlyCents/)
  })

  it('refuses two steps in one month, and more than the limit', () => {
    expect(
      validateContributionSchedule([
        { from: '2027-01', monthlyCents: 1 },
        { from: '2027-01', monthlyCents: 2 },
      ]),
    ).toMatch(/two contribution steps start in 2027-01/)
    const tooMany = Array.from({ length: CONTRIBUTION_STEP_MAX_COUNT + 1 }, (_, i) => ({
      from: `${2027 + i}-01`,
      monthlyCents: 1,
    }))
    expect(validateContributionSchedule(tooMany)).toMatch(/at most/)
    expect(validateContributionSchedule(tooMany.slice(0, CONTRIBUTION_STEP_MAX_COUNT))).toBeNull()
  })
})

describe('normalizeContributionSchedule and parseContributionSchedule', () => {
  it('puts the steps in date order and keeps only the two fields', () => {
    const sorted = normalizeContributionSchedule([
      { from: '2028-03', monthlyCents: 3, extra: true } as never,
      { from: '2027-01', monthlyCents: 1 },
    ])
    expect(sorted).toEqual([
      { from: '2027-01', monthlyCents: 1 },
      { from: '2028-03', monthlyCents: 3 },
    ])
  })

  it('reads a stored column, and reads anything unusable as no changes', () => {
    expect(parseContributionSchedule('[{"from":"2028-03","monthlyCents":250000}]')).toEqual([
      { from: '2028-03', monthlyCents: 250_000 },
    ])
    expect(parseContributionSchedule('[{"from":"2028-03","monthlyCents":9},{"from":"2027-01","monthlyCents":8}]')).toEqual([
      { from: '2027-01', monthlyCents: 8 },
      { from: '2028-03', monthlyCents: 9 },
    ])
    expect(parseContributionSchedule(undefined)).toEqual([])
    expect(parseContributionSchedule(null)).toEqual([])
    expect(parseContributionSchedule('')).toEqual([])
    expect(parseContributionSchedule('not json')).toEqual([])
    expect(parseContributionSchedule('{"from":"2027-01"}')).toEqual([])
    expect(parseContributionSchedule('[{"from":"soon","monthlyCents":1}]')).toEqual([])
  })
})

describe('scheduleSteps', () => {
  it('puts each step on the plan axis: the first of its month, in plan years', () => {
    const steps = scheduleSteps('2026-01-01', [
      { from: '2027-01', monthlyCents: X },
      { from: '2026-07', monthlyCents: 5 },
    ])
    // Sorted by where they fall, July 2026 being half a year in (181 of 365 days).
    expect(steps.map((s) => s.monthlyCents)).toEqual([5, X])
    expect(steps[0]!.offsetYears).toBeCloseTo(181 / 365, 10)
    expect(steps[1]!.offsetYears).toBe(1)
  })

  it('has nothing without a start date, or without a schedule', () => {
    expect(scheduleSteps(null, [{ from: '2027-01', monthlyCents: X }])).toEqual([])
    expect(scheduleSteps(undefined, [{ from: '2027-01', monthlyCents: X }])).toEqual([])
    expect(scheduleSteps('2026-01-01', [])).toEqual([])
    expect(scheduleSteps('2026-01-01', undefined)).toEqual([])
  })

  it('counts by the calendar from a start part way through a month', () => {
    // 25 June 2026 to 1 March 2028: one whole year to 25 June 2027, then 250 of the next 366 days
    // (190 to 1 January 2028 and 60 more, 2028 being a leap year).
    const [step] = scheduleSteps('2026-06-25', [{ from: '2028-03', monthlyCents: X }])
    expect(step!.offsetYears).toBeCloseTo(1 + 250 / 366, 10)
  })
})

describe('monthlyCentsAt', () => {
  const steps = scheduleSteps('2026-01-01', [{ from: '2027-01', monthlyCents: X }])

  it('is the base before any step', () => {
    expect(monthlyCentsAt(B, [], 0)).toBe(B)
    expect(monthlyCentsAt(B, [], 7.5)).toBe(B)
  })

  it('is exactly the step from its month, and stays there', () => {
    expect(monthlyCentsAt(B, steps, 0.99)).toBe(B)
    expect(monthlyCentsAt(B, steps, 1)).toBe(X)
    expect(monthlyCentsAt(B, steps, 3.5)).toBe(X)
  })

  it('takes the latest step in force, and treats a step at or before the start as the starting amount', () => {
    const two = scheduleSteps('2026-01-01', [
      { from: '2027-01', monthlyCents: X },
      { from: '2028-01', monthlyCents: 3_000_00 },
    ])
    expect(monthlyCentsAt(B, two, 1.5)).toBe(X)
    expect(monthlyCentsAt(B, two, 2.5)).toBe(3_000_00)

    const before = scheduleSteps('2026-01-01', [{ from: '2025-06', monthlyCents: X }])
    expect(before[0]!.offsetYears).toBeLessThan(0)
    expect(monthlyCentsAt(B, before, 0)).toBe(X)
  })
})

describe('annualContributionCents', () => {
  it('is twelve times the base with no steps and no inflation', () => {
    expect(annualContributionCents(B, [], 0, 0)).toBe(0)
    expect(annualContributionCents(B, [], 1, 0)).toBe(12 * B)
    expect(annualContributionCents(B, [], 3, 0)).toBe(12 * B)
  })

  it('does not change a year before the first step reaches it', () => {
    const steps = scheduleSteps('2026-01-01', [{ from: '2028-03', monthlyCents: X }])
    expect(annualContributionCents(B, steps, 1, 0)).toBe(annualContributionCents(B, [], 1, 0))
    expect(annualContributionCents(B, steps, 2, 0)).toBe(annualContributionCents(B, [], 2, 0))
  })

  it('switches at a year boundary: the old amount for the year before, the new one after', () => {
    const steps = scheduleSteps('2026-01-01', [{ from: '2027-01', monthlyCents: X }])
    expect(annualContributionCents(B, steps, 1, 0)).toBe(12 * B)
    expect(annualContributionCents(B, steps, 2, 0)).toBe(12 * X)
    expect(annualContributionCents(B, steps, 3, 0)).toBe(12 * X)
  })

  it('weights a step part way through a year by the share of the year each amount was in force', () => {
    // 1 March 2027 is 59 days into the second plan year of a plan that began on 1 January 2026.
    const steps = scheduleSteps('2026-01-01', [{ from: '2027-03', monthlyCents: X }])
    const early = 59 / 365
    expect(annualContributionCents(B, steps, 2, 0)).toBe(Math.round(12 * (B * early + X * (1 - early))))
  })

  it('weights two steps in the same year by the days each was in force', () => {
    const steps = scheduleSteps('2026-01-01', [
      { from: '2027-03', monthlyCents: X },
      { from: '2027-09', monthlyCents: 0 },
    ])
    const [first, second] = steps
    expect(annualContributionCents(B, steps, 2, 0)).toBe(
      Math.round(12 * (B * (first!.offsetYears - 1) + X * (second!.offsetYears - first!.offsetYears) + 0)),
    )
  })

  it('is zero for a pause, and picks up again at the next step', () => {
    const steps = scheduleSteps('2026-01-01', [
      { from: '2027-01', monthlyCents: 0 },
      { from: '2028-01', monthlyCents: X },
    ])
    expect(annualContributionCents(B, steps, 2, 0)).toBe(0)
    expect(annualContributionCents(B, steps, 3, 0)).toBe(12 * X)
  })
  describe('with inflation, the amounts being euros as sent', () => {
    const pi = 0.03

    it('brings each year back to the money of the plan start, so a flat amount counts for less each year', () => {
      const deflator = (year: number) => ((1 + pi) ** -(year - 1) - (1 + pi) ** -year) / Math.log(1 + pi)
      for (const year of [1, 2, 10, 30]) {
        expect(annualContributionCents(B, [], year, pi)).toBe(Math.round(12 * B * deflator(year)))
      }
      expect(annualContributionCents(B, [], 10, pi)).toBeLessThan(annualContributionCents(B, [], 1, pi))
      expect(annualContributionCents(B, [], 1, pi)).toBeLessThan(12 * B)
    })

    it('agrees with discounting the twelve payments of a year one by one', () => {
      for (const year of [1, 5, 20]) {
        let months = 0
        for (let i = 0; i < 12; i++) months += B / (1 + pi) ** (year - 1 + (i + 0.5) / 12)
        expect(Math.abs(annualContributionCents(B, [], year, pi) - months) / months).toBeLessThan(1e-4)
      }
    })

    it('discounts each amount of a year with a change in it by the days it was in force', () => {
      const steps = scheduleSteps('2026-01-01', [{ from: '2027-03', monthlyCents: X }])
      const at = steps[0]!.offsetYears
      const k = Math.log(1 + pi)
      const weight = (from: number, to: number) => ((1 + pi) ** -from - (1 + pi) ** -to) / k
      expect(annualContributionCents(B, steps, 2, pi)).toBe(Math.round(12 * (B * weight(1, at) + X * weight(at, 2))))
    })

    it('is the plain amount when there is no inflation', () => {
      expect(annualContributionCents(B, [], 7, 0)).toBe(12 * B)
    })
  })
})

describe('projecting with a schedule', () => {
  const r = 0.06
  const plan = makeScenario({
    startInvestedCents: 50_000_00,
    monthlyContributionCents: B,
    expectedRealReturn: r,
    horizonYears: 10,
    housePurchaseYear: null,
    planStartDate: '2026-01-01',
    lifeEvents: [],
  })
  const invested = (s: ReturnType<typeof makeScenario>) =>
    projectNetWorth(scenarioToParams(s, 0)).map((p) => p.investedCents)

  it('is the plan as it was with no schedule, and with a schedule it cannot apply', () => {
    const base = invested(plan)
    expect(invested({ ...plan, contributionSchedule: [] })).toEqual(base)
    // Without a start date there is no date for a plan year to start on.
    expect(invested({ ...plan, planStartDate: null, contributionSchedule: [{ from: '2027-01', monthlyCents: X }] })).toEqual(
      invested({ ...plan, planStartDate: null }),
    )
    // A scenario cached before the field was added has none at all.
    const { contributionSchedule: _omitted, ...stale } = plan
    void _omitted
    expect(invested(stale as typeof plan)).toEqual(base)
  })

  it('is unchanged up to the step, and then the closed form of the extra amount', () => {
    const base = invested(plan)
    const stepped = invested({ ...plan, contributionSchedule: [{ from: '2028-01', monthlyCents: X }] })
    // 1 January 2028 is the start of plan year 3, so years 0 to 2 are as they were.
    expect(stepped.slice(0, 3)).toEqual(base.slice(0, 3))
    // From year 3 each year adds 12 * (X - B) more, earning r from the year after it is invested:
    // the extra at year y is 12 * delta * ((1 + r) ** (y - 2) - 1) / r.
    const delta = X - B
    for (const y of [3, 4, 7, 10]) {
      const extra = (12 * delta * ((1 + r) ** (y - 2) - 1)) / r
      expect(stepped[y]! - base[y]!).toBeCloseTo(extra, -1)
    }
  })

  it('shifts every later year by the same closed form when the step falls part way through a year', () => {
    const base = invested(plan)
    const stepped = invested({ ...plan, contributionSchedule: [{ from: '2027-03', monthlyCents: X }] })
    expect(stepped[1]).toBe(base[1])
    // Year 2 takes (1 - 59/365) of a year at the new rate, so its extra is that share of 12 * delta.
    const share = 1 - 59 / 365
    const delta = X - B
    expect(stepped[2]! - base[2]!).toBeCloseTo(12 * delta * share, -1)
    // After that each year's extra is a full 12 * delta, on top of what year 2 added and grew.
    const extra3 = 12 * delta * share * (1 + r) + 12 * delta
    expect(stepped[3]! - base[3]!).toBeCloseTo(extra3, -1)
  })

  it('is unchanged by a step to the amount already in force', () => {
    expect(invested({ ...plan, contributionSchedule: [{ from: '2027-01', monthlyCents: B }] })).toEqual(invested(plan))
  })

  it('stops investing for a pause, and leaves the portfolio to grow', () => {
    const paused = invested({
      ...plan,
      contributionSchedule: [
        { from: '2027-01', monthlyCents: 0 },
        { from: '2029-01', monthlyCents: B },
      ],
    })
    const base = invested(plan)
    expect(paused[1]).toBe(base[1])
    expect(paused[2]).toBe(Math.round(paused[1]! * (1 + r)))
    expect(paused[3]).toBe(Math.round(paused[2]! * (1 + r)))
    expect(paused[4]).toBe(Math.round(paused[3]! * (1 + r) + 12 * B))
  })

  it('reports what each year contributed', () => {
    const points = projectNetWorth(
      scenarioToParams({ ...plan, contributionSchedule: [{ from: '2027-01', monthlyCents: X }] }, 0),
    )
    expect(points.map((p) => p.annualContributionCents).slice(0, 4)).toEqual([0, 12 * B, 12 * X, 12 * X])
  })

  it('keeps a house purchase year working with a schedule', () => {
    const house = {
      ...plan,
      housePriceCents: 300_000_00,
      downPaymentFraction: 0.2,
      housePurchaseYear: 5,
      contributionSchedule: [{ from: '2027-01', monthlyCents: X }],
    }
    const withHouse = projectNetWorth(scenarioToParams(house, DEFAULT_INFLATION_RATE))
    expect(withHouse[5]!.houseEquityCents).toBeGreaterThan(0)
    expect(withHouse[5]!.investedCents).toBeLessThan(withHouse[4]!.investedCents * (1 + r) + 12 * X)
  })
})

describe('what the plan invests on a date', () => {
  const plan = makeScenario({
    planStartDate: '2026-01-01',
    monthlyContributionCents: B,
    contributionSchedule: [
      { from: '2027-03', monthlyCents: X },
      { from: '2029-01', monthlyCents: 0 },
    ],
  })

  it('is the base, then the change in force from the first of its month', () => {
    expect(plannedMonthlyAt(plan, '2026-01-01')).toBe(B)
    expect(plannedMonthlyAt(plan, '2027-02-28')).toBe(B)
    expect(plannedMonthlyAt(plan, '2027-03-01')).toBe(X)
    expect(plannedMonthlyAt(plan, '2028-12-31')).toBe(X)
    expect(plannedMonthlyAt(plan, '2029-01-01')).toBe(0)
  })

  it('reads a date before the start as the start, and no start as the base', () => {
    expect(plannedMonthlyAt(plan, '2025-06-01')).toBe(B)
    expect(plannedMonthlyAt({ ...plan, planStartDate: null }, '2028-01-01')).toBe(B)
  })

  it('averages the months it is asked about, each read in its middle', () => {
    expect(plannedMonthlyAverage(plan, [])).toBe(0)
    expect(plannedMonthlyAverage(plan, ['2026-06'])).toBe(B)
    expect(plannedMonthlyAverage(plan, ['2027-02', '2027-03'])).toBe(Math.round((B + X) / 2))
  })

  it('says what change is coming after a date', () => {
    expect(nextContributionStep(plan, '2026-06-15')).toEqual({ from: '2027-03', monthlyCents: X })
    expect(nextContributionStep(plan, '2027-03-01')).toEqual({ from: '2029-01', monthlyCents: 0 })
    expect(nextContributionStep(plan, '2029-01-01')).toBeNull()
    expect(nextContributionStep({ contributionSchedule: undefined } as never, '2026-06-15')).toBeNull()
  })
})

describe('foldChangesAtOrBefore: moving the plan start past some changes', () => {
  const steps = [
    { from: '2026-03', monthlyCents: 800_00 },
    { from: '2027-01', monthlyCents: 1_200_00 },
    { from: '2028-06', monthlyCents: 0 },
  ]

  it('makes the latest change that has begun by the new start the amount the plan starts with, and drops it and the ones before', () => {
    const out = foldChangesAtOrBefore(500_00, steps, '2027-09-01')
    expect(out.monthlyContributionCents).toBe(1_200_00)
    expect(out.contributionSchedule).toEqual([{ from: '2028-06', monthlyCents: 0 }])
    expect(out.folded).toEqual([steps[0], steps[1]])
  })

  it('reads a change in the start\'s own month as begun, as the engine does (it begins on the 1st)', () => {
    expect(foldChangesAtOrBefore(500_00, steps, '2026-03-15').monthlyContributionCents).toBe(800_00)
    expect(foldChangesAtOrBefore(500_00, steps, '2026-03-01').monthlyContributionCents).toBe(800_00)
    expect(foldChangesAtOrBefore(500_00, steps, '2026-02-28').monthlyContributionCents).toBe(500_00)
  })

  it('leaves everything alone when no change has begun by the start', () => {
    const out = foldChangesAtOrBefore(500_00, steps, '2026-01-01')
    expect(out).toEqual({ monthlyContributionCents: 500_00, contributionSchedule: steps, folded: [] })
  })

  it('folds a pause into the starting amount as 0, and every change when the start is past them all', () => {
    const out = foldChangesAtOrBefore(500_00, steps, '2030-01-01')
    expect(out.monthlyContributionCents).toBe(0)
    expect(out.contributionSchedule).toEqual([])
  })

  it('does the same whatever order the changes arrive in', () => {
    const shuffled = [steps[2]!, steps[0]!, steps[1]!]
    expect(foldChangesAtOrBefore(500_00, shuffled, '2027-09-01')).toEqual(foldChangesAtOrBefore(500_00, steps, '2027-09-01'))
  })

  it('agrees with what the projection reads at the new start: the amount it folds to is the amount in force there', () => {
    for (const start of ['2026-02-01', '2026-03-01', '2026-09-15', '2027-01-01', '2028-06-01', '2031-01-01']) {
      const folded = foldChangesAtOrBefore(500_00, steps, start)
      const inForce = monthlyCentsAt(500_00, scheduleSteps(start, steps), 0)
      expect(folded.monthlyContributionCents, start).toBe(inForce)
    }
  })
})
