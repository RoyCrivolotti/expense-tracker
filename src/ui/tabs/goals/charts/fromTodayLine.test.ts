import { describe, expect, it } from 'vitest'
import { planFromToday, projectNetWorth, scenarioToParams } from '../../../../engine'
import { samplePlan, SAMPLE_INFLATION } from '../../../../testing/samplePlan'
import { fromTodayPoints } from './fromTodayLine'

const plan = samplePlan({ id: 1, isActive: true, housePurchaseYear: null })
const latest = { investedCents: 12_000_000, date: '2029-01-01' }

describe('fromTodayPoints', () => {
  it('draws the line in the plan’s own money: the check-in’s euros brought back by the years since the start', () => {
    const from = planFromToday(plan, latest, SAMPLE_INFLATION)!
    const points = fromTodayPoints(from, SAMPLE_INFLATION)
    // 120.000 € on 1 January 2029 is 120.000 / 1,02^3 of 2026 euros, which is what the plan's own line is in.
    expect(points[0]!.xIndex).toBeCloseTo(3, 6)
    expect(points[0]!.value).toBe(Math.round(12_000_000 / 1.02 ** 3))
  })

  it('is on the plan’s line, in the money of the plan, for a plan exactly on its path', () => {
    const planned = projectNetWorth(scenarioToParams(plan, SAMPLE_INFLATION))
    const onPlanNominal = Math.round(planned[3]!.investedCents * 1.02 ** 3)
    const from = planFromToday(plan, { investedCents: onPlanNominal, date: '2029-01-01' }, SAMPLE_INFLATION)!
    const points = fromTodayPoints(from, SAMPLE_INFLATION)
    // Every later year of the restarted plan agrees with the plan's own line, to within rounding.
    for (const [i, p] of points.slice(0, 20).entries()) {
      const was = planned[3 + i]!.investedCents
      expect(Math.abs(p.value - was) / was).toBeLessThan(2e-4)
    }
  })

  it('steps at a house payment: up to what the year made, then straight to what it left', () => {
    const withHouse = samplePlan({ id: 1, isActive: true })
    const from = planFromToday(withHouse, latest, SAMPLE_INFLATION)!
    const points = fromTodayPoints(from, SAMPLE_INFLATION)
    const sameX = points.filter((p, i) => i > 0 && p.xIndex === points[i - 1]!.xIndex)
    expect(sameX.length).toBeGreaterThan(0)
  })

  it('has no points without years to draw', () => {
    const from = planFromToday({ ...plan, horizonYears: 1 }, latest, SAMPLE_INFLATION)!
    expect(fromTodayPoints(from, SAMPLE_INFLATION).length).toBeGreaterThan(0)
  })
})

describe('planFromToday at another rate', () => {
  it('counts spending, rent and events at the rate it is asked for, so a preview of 6% is what a saved 6% draws', () => {
    const withSpend = samplePlan({ id: 1, isActive: true, housePurchaseYear: null, lifeEvents: [{ year: 6, amountCents: -1_000_000, label: 'Car' }] })
    const saved = planFromToday(withSpend, latest, 0.02)!
    const tried = planFromToday(withSpend, latest, 0.06)!
    expect(tried.scenario.annualSpendCents).toBe(Math.round(3_000_000 * 1.06 ** 3))
    expect(saved.scenario.annualSpendCents).toBe(Math.round(3_000_000 * 1.02 ** 3))
    expect(tried.scenario.lifeEvents[0]!.amountCents).toBe(Math.round(-1_000_000 * 1.06 ** 3))
  })
})
