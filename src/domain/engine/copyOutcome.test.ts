import { describe, expect, it } from 'vitest'
import { randomPlans, samplePlan, SAMPLE_INFLATION as I, TEST_INFLATION_RATES } from '../../testing/samplePlan'
import type { GoalScenario } from '../types'
import { copyOutcome } from './copyOutcome'
import { dateAtYears, yearsBetween } from './dates'
import { projectNetWorth } from './projection'
import { valueOnAxisAt } from './scenarioAxis'
import { scenarioToParams } from './scenarioProjection'
import { startLater, suggestedStart } from './startLater'

function copyOf(plan: GoalScenario, date: string, rate: number): GoalScenario {
  const s = suggestedStart(plan, null, date, rate)!
  return { ...plan, ...startLater(plan, { date, investedCents: s.cents }, rate)!.patch }
}

describe('copyOutcome', () => {
  it('finds a copy of a plan with nothing dated, started on an anniversary, on its source at the end and never above on net worth', () => {
    for (const rate of TEST_INFLATION_RATES) {
      for (const plan of randomPlans(270, 12).map((p) => ({ ...p, housePurchaseYear: null, lifeEvents: [], contributionSchedule: [] }))) {
        const years = 1 + (plan.horizonYears % 7)
        const copy = copyOf(plan, dateAtYears(plan.planStartDate!, years), rate)
        const o = copyOutcome(plan, copy, rate)!
        expect(o.endDate).toBe(dateAtYears(plan.planStartDate!, plan.horizonYears))
        expect(Math.abs(o.investedGapCents)).toBeLessThanOrEqual(70)
        expect(o.netWorthAbove).toBeNull()
      }
    }
  })

  it('reads the end figures through the same reader as the chart and the table', () => {
    const plan = samplePlan()
    const copy = copyOf(plan, '2028-11-15', I)
    const o = copyOutcome(plan, copy, I)!
    const end = plan.horizonYears
    const offset = yearsBetween('2026-01-01', '2028-11-15')
    const theirs = projectNetWorth(scenarioToParams(plan, I))
    const ours = projectNetWorth(scenarioToParams(copy, I))
    expect(o.sourceInvestedCents).toBe(valueOnAxisAt(theirs, 0, I, end))
    expect(o.investedGapCents).toBe(valueOnAxisAt(ours, offset, I, end)! - valueOnAxisAt(theirs, 0, I, end)!)
    expect(o.netWorthGapCents).toBe(valueOnAxisAt(ours, offset, I, end, 'netWorth')! - valueOnAxisAt(theirs, 0, I, end, 'netWorth')!)
  })

  it('has a copy that buys its house sooner read higher on net worth for a while, and lower on invested, at any inflation', () => {
    for (const rate of TEST_INFLATION_RATES) {
      const o = copyOutcome(samplePlan(), copyOf(samplePlan(), '2026-07-03', rate), rate)!
      expect(o.netWorthAbove).not.toBeNull()
      // The house is bought on 3 Jul 2033, six months before the source's 1 Jan 2034.
      expect(o.netWorthAbove!.from <= '2034-01').toBe(true)
      expect(o.investedGapCents).toBeLessThan(0)
    }
  })

  it('ends where the first of the two ends, and says nothing without both starts or for a copy that starts first', () => {
    const plan = samplePlan()
    const short = { ...copyOf(plan, '2030-01-01', I), horizonYears: 10 }
    expect(copyOutcome(plan, short, I)!.endDate).toBe('2040-01-01')
    expect(copyOutcome({ ...plan, planStartDate: null }, short, I)).toBeNull()
    expect(copyOutcome(plan, { ...short, planStartDate: null }, I)).toBeNull()
    expect(copyOutcome(plan, { ...short, planStartDate: '2025-01-01' }, I)).toBeNull()
  })
})
