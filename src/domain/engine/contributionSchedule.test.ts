import { describe, expect, it } from 'vitest'
import {
  CONTRIBUTION_STEP_MAX_CENTS,
  CONTRIBUTION_STEP_MAX_COUNT,
  annualContributionCents,
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

  it('is the base grown by whole years before any step, as it always was', () => {
    expect(monthlyCentsAt(B, 0.1, [], 0)).toBe(B)
    expect(monthlyCentsAt(B, 0.1, [], 0.99)).toBe(B)
    expect(monthlyCentsAt(B, 0.1, [], 1)).toBeCloseTo(B * 1.1, 6)
    expect(monthlyCentsAt(B, 0.1, [], 2.5)).toBeCloseTo(B * 1.21, 6)
  })

  it('is exactly the step from its month, and grows from there, not from the plan start', () => {
    expect(monthlyCentsAt(B, 0.1, steps, 0.99)).toBeCloseTo(B, 6)
    expect(monthlyCentsAt(B, 0.1, steps, 1)).toBe(X)
    expect(monthlyCentsAt(B, 0.1, steps, 1.99)).toBe(X)
    expect(monthlyCentsAt(B, 0.1, steps, 2)).toBeCloseTo(X * 1.1, 6)
    expect(monthlyCentsAt(B, 0.1, steps, 3.5)).toBeCloseTo(X * 1.21, 6)
  })

  it('anchors growth to a step that is part way through the year', () => {
    const mid = scheduleSteps('2026-01-01', [{ from: '2026-07', monthlyCents: X }])
    const at = mid[0]!.offsetYears
    expect(monthlyCentsAt(B, 0.1, mid, at + 0.99)).toBe(X)
    expect(monthlyCentsAt(B, 0.1, mid, at + 1)).toBeCloseTo(X * 1.1, 6)
  })

  it('takes the latest step in force, and treats a step at or before the start as the starting amount', () => {
    const two = scheduleSteps('2026-01-01', [
      { from: '2027-01', monthlyCents: X },
      { from: '2028-01', monthlyCents: 3_000_00 },
    ])
    expect(monthlyCentsAt(B, 0, two, 1.5)).toBe(X)
    expect(monthlyCentsAt(B, 0, two, 2.5)).toBe(3_000_00)

    const before = scheduleSteps('2026-01-01', [{ from: '2025-06', monthlyCents: X }])
    expect(before[0]!.offsetYears).toBeLessThan(0)
    expect(monthlyCentsAt(B, 0.1, before, 0)).toBe(X)
    expect(monthlyCentsAt(B, 0.1, before, 1)).toBeCloseTo(X * 1.1, 6)
  })
})

describe('annualContributionCents', () => {
  it('is twelve times the base grown by whole years with no steps, exactly as before', () => {
    expect(annualContributionCents(B, 0, [], 0)).toBe(0)
    expect(annualContributionCents(B, 0, [], 1)).toBe(12 * B)
    expect(annualContributionCents(B, 0.05, [], 3)).toBe(Math.round(B * 12 * 1.05 ** 2))
  })

  it('does not change a year before the first step reaches it', () => {
    const steps = scheduleSteps('2026-01-01', [{ from: '2028-03', monthlyCents: X }])
    expect(annualContributionCents(B, 0.05, steps, 1)).toBe(annualContributionCents(B, 0.05, [], 1))
    expect(annualContributionCents(B, 0.05, steps, 2)).toBe(annualContributionCents(B, 0.05, [], 2))
  })

  it('switches at a year boundary: the old amount for the year before, the new one after', () => {
    const steps = scheduleSteps('2026-01-01', [{ from: '2027-01', monthlyCents: X }])
    expect(annualContributionCents(B, 0, steps, 1)).toBe(12 * B)
    expect(annualContributionCents(B, 0, steps, 2)).toBe(12 * X)
    expect(annualContributionCents(B, 0, steps, 3)).toBe(12 * X)
  })

  it('weights a step part way through a year by the share of the year each amount was in force', () => {
    // 1 March 2027 is 59 days into the second plan year of a plan that began on 1 January 2026.
    const steps = scheduleSteps('2026-01-01', [{ from: '2027-03', monthlyCents: X }])
    const early = 59 / 365
    expect(annualContributionCents(B, 0, steps, 2)).toBe(Math.round(12 * (B * early + X * (1 - early))))
  })

  it('grows a step on its own anniversaries, which can fall inside a plan year', () => {
    // Step at offset 0.5; with 10% growth the new amount grows at 1.5, in the middle of year 2.
    const steps = scheduleSteps('2026-01-01', [{ from: '2026-07', monthlyCents: X }])
    const at = steps[0]!.offsetYears
    expect(annualContributionCents(B, 0.1, steps, 1)).toBe(Math.round(12 * (B * at + X * (1 - at))))
    // Year 2 spans offsets 1 to 2: X until the anniversary at `at + 1`, X * 1.1 after it.
    const anniversary = at + 1
    expect(annualContributionCents(B, 0.1, steps, 2)).toBe(
      Math.round(12 * (X * (anniversary - 1) + X * 1.1 * (2 - anniversary))),
    )
  })

  it('is zero for a pause, and picks up again at the next step', () => {
    const steps = scheduleSteps('2026-01-01', [
      { from: '2027-01', monthlyCents: 0 },
      { from: '2028-01', monthlyCents: X },
    ])
    expect(annualContributionCents(B, 0, steps, 2)).toBe(0)
    expect(annualContributionCents(B, 0, steps, 3)).toBe(12 * X)
  })
})

describe('projecting with a schedule', () => {
  const r = 0.06
  const plan = makeScenario({
    startInvestedCents: 50_000_00,
    monthlyContributionCents: B,
    annualContributionGrowth: 0,
    expectedRealReturn: r,
    horizonYears: 10,
    housePurchaseYear: null,
    planStartDate: '2026-01-01',
    lifeEvents: [],
  })
  const invested = (s: ReturnType<typeof makeScenario>) =>
    projectNetWorth(scenarioToParams(s, DEFAULT_INFLATION_RATE)).map((p) => p.investedCents)

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

  it('is unchanged by a step to the amount already in force, with or without growth', () => {
    expect(invested({ ...plan, contributionSchedule: [{ from: '2027-01', monthlyCents: B }] })).toEqual(invested(plan))
    // With 10% growth the base is 1,100 from the start of year 2, which is where a step at that date would put it.
    const growing = { ...plan, annualContributionGrowth: 0.1 }
    expect(
      invested({ ...growing, contributionSchedule: [{ from: '2027-01', monthlyCents: Math.round(B * 1.1) }] }),
    ).toEqual(invested(growing))
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
      scenarioToParams({ ...plan, contributionSchedule: [{ from: '2027-01', monthlyCents: X }] }, DEFAULT_INFLATION_RATE),
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
    annualContributionGrowth: 0.1,
    contributionSchedule: [
      { from: '2027-03', monthlyCents: X },
      { from: '2029-01', monthlyCents: 0 },
    ],
  })

  it('is the base grown by whole years, then the change in force grown from its own month', () => {
    expect(plannedMonthlyAt(plan, '2026-01-01')).toBe(B)
    expect(plannedMonthlyAt(plan, '2026-12-31')).toBe(B)
    expect(plannedMonthlyAt(plan, '2027-01-01')).toBe(Math.round(B * 1.1))
    // A change takes effect on the first of its month, at its own amount, not grown.
    expect(plannedMonthlyAt(plan, '2027-02-28')).toBe(Math.round(B * 1.1))
    expect(plannedMonthlyAt(plan, '2027-03-01')).toBe(X)
    expect(plannedMonthlyAt(plan, '2028-02-28')).toBe(X)
    expect(plannedMonthlyAt(plan, '2028-03-01')).toBe(Math.round(X * 1.1))
    expect(plannedMonthlyAt(plan, '2029-01-01')).toBe(0)
  })

  it('reads a date before the start as the start, and no start as the base', () => {
    expect(plannedMonthlyAt(plan, '2025-06-01')).toBe(B)
    expect(plannedMonthlyAt({ ...plan, planStartDate: null }, '2028-01-01')).toBe(B)
  })

  it('averages the months it is asked about, each read in its middle', () => {
    expect(plannedMonthlyAverage(plan, [])).toBe(0)
    expect(plannedMonthlyAverage(plan, ['2026-06'])).toBe(B)
    expect(plannedMonthlyAverage(plan, ['2027-02', '2027-03'])).toBe(Math.round((Math.round(B * 1.1) + X) / 2))
  })

  it('says what change is coming after a date', () => {
    expect(nextContributionStep(plan, '2026-06-15')).toEqual({ from: '2027-03', monthlyCents: X })
    expect(nextContributionStep(plan, '2027-03-01')).toEqual({ from: '2029-01', monthlyCents: 0 })
    expect(nextContributionStep(plan, '2029-01-01')).toBeNull()
    expect(nextContributionStep({ contributionSchedule: undefined } as never, '2026-06-15')).toBeNull()
  })
})
