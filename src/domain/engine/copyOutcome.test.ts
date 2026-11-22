import { describe, expect, it } from 'vitest'
import { randomPlans, samplePlan, SAMPLE_INFLATION as I, TEST_INFLATION_RATES } from '../../testing/samplePlan'
import type { GoalScenario } from '../types'
import { copyOutcome } from './copyOutcome'
import { dateAtYears, yearsBetween } from './dates'
import { projectNetWorth } from './projection'
import { valueOnAxisAt } from './scenarioAxis'
import { scenarioToParams } from './scenarioProjection'
import { startLater, suggestedStart } from './startLater'

function copyOf(
  plan: GoalScenario,
  date: string,
  rate: number,
): GoalScenario {
  const s = suggestedStart(plan, null, date, rate)!
  return { ...plan, ...startLater(plan, { date, investedCents: s.cents }, rate)!.patch }
}

describe('copyOutcome', () => {
  it('finds a copy of a plan with nothing dated, started on an anniversary, on its source at the end and never above on net worth', () => {
    for (const rate of TEST_INFLATION_RATES) {
      for (const plan of randomPlans(270, 12).map((p) => ({
        ...p,
        housePurchaseYear: null,
        lifeEvents: [],
        contributionSchedule: [],
      }))) {
        const years = 1 + (plan.horizonYears % 7)
        const copy = copyOf(plan, dateAtYears(plan.planStartDate!, years), rate)
        const o = copyOutcome(plan, copy, rate, { origin: plan.planStartDate!, year: plan.horizonYears })!
        expect(o.endDate).toBe(dateAtYears(plan.planStartDate!, plan.horizonYears))
        expect(Math.abs(o.investedGapCents!)).toBeLessThanOrEqual(70)
        expect(o.netWorthAbove).toBeNull()
      }
    }
  })

  it('reads the end figures through the same reader as the chart and the table', () => {
    const plan = samplePlan()
    const copy = copyOf(plan, '2028-11-15', I)
    const end = plan.horizonYears
    const o = copyOutcome(plan, copy, I, { origin: '2026-01-01', year: end })!
    const offset = yearsBetween('2026-01-01', '2028-11-15')
    const theirs = projectNetWorth(scenarioToParams(plan, I))
    const ours = projectNetWorth(scenarioToParams(copy, I))
    expect(o.sourceInvestedCents).toBe(valueOnAxisAt(theirs, 0, I, end))
    expect(o.investedGapCents).toBe(valueOnAxisAt(ours, offset, I, end)! - valueOnAxisAt(theirs, 0, I, end)!)
    expect(o.netWorthGapCents).toBe(
      valueOnAxisAt(ours, offset, I, end, 'netWorth')! - valueOnAxisAt(theirs, 0, I, end, 'netWorth')!,
    )
  })

  it('has a copy that buys its house sooner read higher on net worth for a while, and lower on invested, at any inflation', () => {
    for (const rate of TEST_INFLATION_RATES) {
      const o = copyOutcome(samplePlan(), copyOf(samplePlan(), '2026-07-03', rate), rate, {
        origin: '2026-01-01',
        year: 30,
      })!
      expect(o.netWorthAbove).not.toBeNull()
      // The house is bought on 3 Jul 2033, six months before the source's 1 Jan 2034.
      expect(o.netWorthAbove!.from <= '2034-01').toBe(true)
      expect(o.investedGapCents).toBeLessThan(0)
    }
  })

  it('reads on another origin’s calendar and year, in its euros, and says nothing without both starts or for a copy that starts first', () => {
    const plan = samplePlan()
    const copy = copyOf(plan, '2030-01-01', I)
    const at = { origin: '2024-06-01', year: 28 }
    const o = copyOutcome(plan, copy, I, at)!
    expect(o.endDate).toBe('2052-06-01')
    expect(o.origin).toBe('2024-06-01')
    const theirs = projectNetWorth(scenarioToParams(plan, I))
    const ours = projectNetWorth(scenarioToParams(copy, I))
    const read = (
      points: typeof theirs,
      start: string,
    ) => valueOnAxisAt(points, yearsBetween(at.origin, start), I, at.year)!
    expect(o.investedGapCents).toBe(read(ours, '2030-01-01') - read(theirs, '2026-01-01'))
    // Read past where the copy has ended, there is no gap to give.
    expect(
      copyOutcome(plan, { ...copy, horizonYears: 5 }, I, { origin: '2026-01-01', year: 20 })!.investedGapCents,
    ).toBeNull()
    const days = { origin: '2026-01-01', year: 20 }
    expect(copyOutcome({ ...plan, planStartDate: null }, copy, I, days)).toBeNull()
    expect(copyOutcome(plan, { ...copy, planStartDate: null }, I, days)).toBeNull()
    expect(copyOutcome(plan, { ...copy, planStartDate: '2025-01-01' }, I, days)).toBeNull()
    expect(copyOutcome(plan, copy, I, { origin: '2027-01-01', year: 20 })).toBeNull()
  })
})
