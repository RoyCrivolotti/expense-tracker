import { describe, expect, it } from 'vitest'
import { milestoneCrossingDate, milestoneStanding, yearsToAmount } from './milestoneOutlook'
import { projectNetWorth, scenarioToParams } from '.'
import { makeScenario } from '../../testing/factories'

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

describe('yearsToAmount', () => {
  it('is zero for an amount already held, and interpolates inside the crossing year', () => {
    expect(yearsToAmount(plan, 50_000_00)).toBe(0)
    const points = projectNetWorth(scenarioToParams(plan))
    const y1 = points[1]!.investedCents
    const y2 = points[2]!.investedCents
    const halfway = Math.round((y1 + y2) / 2)
    expect(yearsToAmount(plan, halfway)).toBeCloseTo(1.5, 1)
  })

  it('is null past the horizon', () => {
    expect(yearsToAmount(plan, 1_000_000_000_00)).toBeNull()
  })
})

describe('milestoneCrossingDate', () => {
  it('places the crossing on the calendar from the plan start', () => {
    const points = projectNetWorth(scenarioToParams(plan))
    expect(milestoneCrossingDate(plan, points[2]!.investedCents)).toBe('2028-01-01')
    expect(milestoneCrossingDate(plan, points[3]!.investedCents)).toMatch(/^2029-01-0[12]$/)
  })

  it('needs a start date', () => {
    expect(milestoneCrossingDate(makeScenario({ planStartDate: null }), 1)).toBeNull()
  })
})

describe('milestoneStanding', () => {
  const points = projectNetWorth(scenarioToParams(plan))
  const inYearTwo = { amountCents: points[2]!.investedCents, label: '' }

  it('is reached when a check-in says so, whatever the plan thinks', () => {
    expect(milestoneStanding({ ...inYearTwo, targetDate: '2027-01-01' }, plan, '2026-06-01')).toEqual({
      kind: 'reached',
      on: '2026-06-01',
    })
  })

  it('is on track when the plan gets there before the target, late otherwise', () => {
    expect(milestoneStanding({ ...inYearTwo, targetDate: '2028-06-01' }, plan, undefined)).toEqual({
      kind: 'on-track',
      expected: '2028-01-01',
      target: '2028-06-01',
    })
    expect(milestoneStanding({ ...inYearTwo, targetDate: '2027-07-01' }, plan, undefined)).toEqual({
      kind: 'late',
      expected: '2028-01-01',
      target: '2027-07-01',
      monthsLate: 6,
    })
  })

  it("is overdue once the plan's own date has passed with no check-in reaching it", () => {
    expect(milestoneStanding(inYearTwo, plan, undefined, '2028-06-01')).toEqual({
      kind: 'overdue',
      expected: '2028-01-01',
      target: null,
    })
    // The target is still ahead, but "on track" would be the plan's word against the facts.
    expect(milestoneStanding({ ...inYearTwo, targetDate: '2029-01-01' }, plan, undefined, '2028-06-01')).toEqual({
      kind: 'overdue',
      expected: '2028-01-01',
      target: '2029-01-01',
    })
    expect(milestoneStanding(inYearTwo, plan, '2028-03-01', '2028-06-01').kind).toBe('reached')
    // On the expected date itself the check-in already counts as evidence.
    expect(milestoneStanding(inYearTwo, plan, undefined, '2028-01-01').kind).toBe('overdue')
    // With no check-in, or one from before the plan's date, the plan's word stands.
    expect(milestoneStanding(inYearTwo, plan, undefined).kind).toBe('expected')
    expect(milestoneStanding(inYearTwo, plan, undefined, '2027-12-31').kind).toBe('expected')
  })

  it('cannot be dated from a malformed start date', () => {
    expect(milestoneCrossingDate(makeScenario({ ...plan, planStartDate: 'garbage' }), 120_000_00)).toBeNull()
  })

  it('gives the expected date alone without a target, and says so past the horizon', () => {
    expect(milestoneStanding(inYearTwo, plan, undefined)).toEqual({ kind: 'expected', expected: '2028-01-01' })
    expect(milestoneStanding({ amountCents: 1_000_000_000_00, label: '', targetDate: '2030-01-01' }, plan, undefined)).toEqual({
      kind: 'beyond-horizon',
      target: '2030-01-01',
    })
  })

  it('is unknown without a plan or a start date', () => {
    expect(milestoneStanding(inYearTwo, null, undefined)).toEqual({ kind: 'unknown' })
    expect(milestoneStanding(inYearTwo, makeScenario({ planStartDate: null }), undefined)).toEqual({ kind: 'unknown' })
  })
})
