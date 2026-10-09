import { describe, expect, it } from 'vitest'
import { fiYearsExact, milestoneCrossingDate, milestoneStanding, wholeYearsToAmount, yearsToAmount } from './milestoneOutlook'
import { fireNumber, projectNetWorth, scenarioToParams, yearsToFi } from '.'
import { makeScenario } from '../../testing/factories'
import { DEFAULT_INFLATION_RATE } from './projectionConstants'
import { samplePlan, SAMPLE_INFLATION } from '../../testing/samplePlan'

const plan = makeScenario({
  id: 1,
  isActive: true,
  planStartDate: '2026-01-01',
  startInvestedCents: 100_000_00,
  monthlyContributionCents: 1_000_00,
  expectedRealReturn: 0.05,
  horizonYears: 20,
  housePurchaseYear: null,
})

const G = 1 + DEFAULT_INFLATION_RATE

/** What the account shows at the end of a year of the plan: the line in the plan's money grown by the inflation since. */
function onAccount(year: number): number {
  return Math.round(projectNetWorth(scenarioToParams(plan, DEFAULT_INFLATION_RATE))[year]!.investedCents * Math.pow(G, year))
}

describe('yearsToAmount', () => {
  it('is zero for an amount already held, and finds the day inside the crossing year', () => {
    expect(yearsToAmount(plan, 50_000_00, DEFAULT_INFLATION_RATE)).toBe(0)
    const halfway = Math.round((onAccount(1) + onAccount(2)) / 2)
    expect(yearsToAmount(plan, halfway, DEFAULT_INFLATION_RATE)).toBeCloseTo(1.5, 1)
  })

  it('has the amount on the account before the line itself reaches it', () => {
    // The line is in the money of the start, so it reaches 150.000 euros later than the account shows 150.000.
    const line = projectNetWorth(scenarioToParams(plan, DEFAULT_INFLATION_RATE))[2]!.investedCents
    expect(yearsToAmount(plan, line, DEFAULT_INFLATION_RATE)!).toBeLessThan(2)
  })

  it('is null past the horizon', () => {
    expect(yearsToAmount(plan, 1_000_000_000_00, DEFAULT_INFLATION_RATE)).toBeNull()
  })
})

describe('fiYearsExact', () => {
  const fi = (over = {}) =>
    scenarioToParams(
      makeScenario({ startInvestedCents: 50_000_000, monthlyContributionCents: 0, expectedRealReturn: 0.05, housePurchaseYear: null, horizonYears: 20, annualSpendCents: 3_000_000, safeWithdrawalRate: 0.04, lifeEvents: [], ...over }),
      0,
    )

  it('is the day inside the year FI is reached in: between the year before and that year', () => {
    for (const over of [{}, { monthlyContributionCents: 200_000, startInvestedCents: 1_000_000 }, { annualSpendCents: 1_500_000, startInvestedCents: 2_000_000, monthlyContributionCents: 100_000 }]) {
      const params = fi(over)
      const spend = over && 'annualSpendCents' in over ? (over as { annualSpendCents: number }).annualSpendCents : 3_000_000
      const year = yearsToFi(params, spend, 0.04)
      const exact = fiYearsExact(params, spend, 0.04)
      expect(year).not.toBeNull()
      expect(exact!).toBeGreaterThan(year! - 1 - 1e-9)
      expect(exact!).toBeLessThanOrEqual(year! + 1e-9)
    }
  })

  it('is where the line passes the target, drawn straight between the year ends', () => {
    // 500.000 growing at 5% against a 750.000 target: past it between year 8 and year 9.
    const at = (year: number) => 50_000_000 * Math.pow(1.05, year)
    const share = (fireNumber(3_000_000, 0.04) - at(8)) / (at(9) - at(8))
    expect(fiYearsExact(fi(), 3_000_000, 0.04)!).toBeCloseTo(8 + share, 3)
  })

  it('is the anniversary when the target is only reached by a step up on it', () => {
    // 100.000 with no growth, then a 700.000 inflow in year 5: 750.000 is first held after it.
    const params = fi({ startInvestedCents: 10_000_000, expectedRealReturn: 0, lifeEvents: [{ label: 'Inheritance', year: 5, amountCents: 70_000_000 }] })
    expect(yearsToFi(params, 3_000_000, 0.04)).toBe(5)
    expect(fiYearsExact(params, 3_000_000, 0.04)).toBe(5)
  })

  it('is zero when the target is held at the start, and null when it is never reached', () => {
    expect(fiYearsExact(fi({ startInvestedCents: 80_000_000 }), 3_000_000, 0.04)).toBe(0)
    expect(fiYearsExact(fi({ startInvestedCents: 1_000_000, expectedRealReturn: 0 }), 3_000_000, 0.04)).toBeNull()
  })
})

describe('milestoneCrossingDate', () => {
  it('places the crossing on the calendar from the plan start', () => {
    expect(milestoneCrossingDate(plan, onAccount(2), DEFAULT_INFLATION_RATE)).toBe('2028-01-01')
    expect(milestoneCrossingDate(plan, onAccount(3), DEFAULT_INFLATION_RATE)).toMatch(/^2029-01-0[12]$/)
  })

  it('needs a start date', () => {
    expect(milestoneCrossingDate(makeScenario({ planStartDate: null }), 1, DEFAULT_INFLATION_RATE)).toBeNull()
  })
})

describe('milestoneStanding', () => {
  const inYearTwo = { amountCents: onAccount(2), label: '' }
  /** What the plan says the amount is worth, in the euros of its start, on the day it has it: two years in. */
  const worth = Math.round(inYearTwo.amountCents / Math.pow(G, 2))

  it('is reached when a check-in says so, whatever the plan thinks', () => {
    expect(milestoneStanding({ ...inYearTwo, targetDate: '2027-01-01' }, plan, '2026-06-01', DEFAULT_INFLATION_RATE)).toEqual({
      kind: 'reached',
      on: '2026-06-01',
    })
  })

  it('is on track when the plan gets there before the target, late otherwise', () => {
    expect(milestoneStanding({ ...inYearTwo, targetDate: '2028-06-01' }, plan, undefined, DEFAULT_INFLATION_RATE)).toEqual({
      kind: 'on-track',
      expected: '2028-01-01',
      target: '2028-06-01',
      worthCents: worth,
      dipsOn: null,
    })
    expect(milestoneStanding({ ...inYearTwo, targetDate: '2027-07-01' }, plan, undefined, DEFAULT_INFLATION_RATE)).toEqual({
      kind: 'late',
      expected: '2028-01-01',
      target: '2027-07-01',
      monthsLate: 6,
      worthCents: worth,
      dipsOn: null,
    })
  })

  it("is overdue once the plan's own date has passed with no check-in reaching it", () => {
    expect(milestoneStanding(inYearTwo, plan, undefined, DEFAULT_INFLATION_RATE, '2028-06-01')).toEqual({
      kind: 'overdue',
      expected: '2028-01-01',
      target: null,
      worthCents: worth,
      dipsOn: null,
    })
    // The target is still ahead, but "on track" would be the plan's word against the facts.
    expect(milestoneStanding({ ...inYearTwo, targetDate: '2029-01-01' }, plan, undefined, DEFAULT_INFLATION_RATE, '2028-06-01')).toEqual({
      kind: 'overdue',
      expected: '2028-01-01',
      target: '2029-01-01',
      worthCents: worth,
      dipsOn: null,
    })
    expect(milestoneStanding(inYearTwo, plan, '2028-03-01', DEFAULT_INFLATION_RATE, '2028-06-01').kind).toBe('reached')
    // On the expected date itself the check-in already counts as evidence.
    expect(milestoneStanding(inYearTwo, plan, undefined, DEFAULT_INFLATION_RATE, '2028-01-01').kind).toBe('overdue')
    // With no check-in, or one from before the plan's date, the plan's word stands.
    expect(milestoneStanding(inYearTwo, plan, undefined, DEFAULT_INFLATION_RATE).kind).toBe('expected')
    expect(milestoneStanding(inYearTwo, plan, undefined, DEFAULT_INFLATION_RATE, '2027-12-31').kind).toBe('expected')
  })

  it('cannot be dated from a malformed start date', () => {
    expect(milestoneCrossingDate(makeScenario({ ...plan, planStartDate: 'garbage' }), 120_000_00, DEFAULT_INFLATION_RATE)).toBeNull()
  })

  it('gives the expected date alone without a target, and says so past the horizon', () => {
    expect(milestoneStanding(inYearTwo, plan, undefined, DEFAULT_INFLATION_RATE)).toEqual({
      kind: 'expected',
      expected: '2028-01-01',
      worthCents: worth,
      dipsOn: null,
    })
    expect(milestoneStanding({ amountCents: 1_000_000_000_00, label: '', targetDate: '2030-01-01' }, plan, undefined, DEFAULT_INFLATION_RATE)).toEqual({
      kind: 'beyond-horizon',
      target: '2030-01-01',
    })
  })

  it('is unknown without a plan or a start date', () => {
    expect(milestoneStanding(inYearTwo, null, undefined, DEFAULT_INFLATION_RATE)).toEqual({ kind: 'unknown' })
    expect(milestoneStanding(inYearTwo, makeScenario({ planStartDate: null }), undefined, DEFAULT_INFLATION_RATE)).toEqual({ kind: 'unknown' })
  })
})

describe('milestoneStanding for a plan that falls back under an amount', () => {
  // The sample plan reaches 150.000 euros on the account before year 8 and a house payment in year 8 takes it under again.
  const house = samplePlan({ id: 1, isActive: true })

  it('says when the plan falls back, and what the amount is worth in the plan\u2019s money on the day it first has it', () => {
    const standing = milestoneStanding({ amountCents: 15_000_000, label: '' }, house, undefined, SAMPLE_INFLATION)
    expect(standing.kind).toBe('expected')
    if (standing.kind !== 'expected') return
    expect(standing.expected >= '2031-01-01' && standing.expected < '2034-01-01').toBe(true)
    expect(standing.dipsOn).toBe('2034-01-01')
    // 150.000 euros on the account between years 5 and 8 is 128.000 to 136.000 in the euros of 2026.
    expect(standing.worthCents).toBeGreaterThan(12_500_000)
    expect(standing.worthCents).toBeLessThan(14_500_000)
  })

  it('has no fall for an amount the plan reaches and keeps', () => {
    const standing = milestoneStanding({ amountCents: 50_000_000, label: '' }, house, undefined, SAMPLE_INFLATION)
    expect(standing).toMatchObject({ kind: 'expected', dipsOn: null })
  })
})

describe('wholeYearsToAmount', () => {
  const params = scenarioToParams(plan, DEFAULT_INFLATION_RATE)

  it('is the first yearly step at which the account shows the amount, which is what the table and the narrative count in', () => {
    expect(wholeYearsToAmount(params, onAccount(2), DEFAULT_INFLATION_RATE)).toBe(2)
    expect(wholeYearsToAmount(params, onAccount(2) + 1, DEFAULT_INFLATION_RATE)).toBe(3)
    expect(wholeYearsToAmount(params, onAccount(2) - 1, DEFAULT_INFLATION_RATE)).toBe(2)
  })

  it('is the whole years of the date the chip gives: rounded up from the crossing', () => {
    const amount = Math.round((onAccount(4) + onAccount(5)) / 2)
    const exact = yearsToAmount(plan, amount, DEFAULT_INFLATION_RATE)!
    expect(wholeYearsToAmount(params, amount, DEFAULT_INFLATION_RATE)).toBe(Math.ceil(exact))
  })

  it('is 0 for an amount held at the start, and null past the horizon', () => {
    expect(wholeYearsToAmount(params, 50_000_00, DEFAULT_INFLATION_RATE)).toBe(0)
    expect(wholeYearsToAmount(params, 1_000_000_000_00, DEFAULT_INFLATION_RATE)).toBeNull()
  })
})
