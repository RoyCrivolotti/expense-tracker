import { describe, expect, it } from 'vitest'
import { planFromToday } from './planFromToday'
import { projectNetWorth } from './projection'
import { scenarioToParams } from './scenarioProjection'
import { DEFAULT_INFLATION_RATE } from './projectionConstants'
import { makeScenario } from '../../testing/factories'

const plan = makeScenario({
  id: 1,
  name: 'Path A',
  planStartDate: '2024-01-01',
  startInvestedCents: 100_000_00,
  monthlyContributionCents: 1_000_00,
  annualContributionGrowth: 0.05,
  lifeEvents: [{ year: 1, amountCents: 5_000_00, label: 'Bonus' }, { year: 3, amountCents: -20_000_00, label: 'Car' }],
  housePurchaseYear: 5,
  isActive: true,
})

describe('planFromToday', () => {
  it('restarts the plan from the check-in with its balance and date, and leaves the plan alone', () => {
    const latest = { investedCents: 160_000_00, date: '2026-01-01' }
    const from = planFromToday(plan, latest)!
    expect(from.scenario.startInvestedCents).toBe(160_000_00)
    expect(from.scenario.planStartDate).toBe('2026-01-01')
    expect(from.since).toBe('2026-01-01')
    expect(from.offsetYears).toBeCloseTo(2, 1)
    // Ahead of plan, so the restarted line runs above the plan's own at the same calendar year.
    const params = scenarioToParams(from.scenario, DEFAULT_INFLATION_RATE)
    const planned = projectNetWorth(scenarioToParams(plan, DEFAULT_INFLATION_RATE))
    expect(projectNetWorth(params)[0]!.investedCents).toBeGreaterThan(planned[2]!.investedCents)
    expect(plan.startInvestedCents).toBe(100_000_00)
  })

  it('carries what a re-baseline would: events on their dates, a grown contribution', () => {
    const from = planFromToday(plan, { investedCents: 1, date: '2026-01-01' })!
    // The bonus is behind the check-in and already in the balance; the car and the house keep their dates.
    expect(from.scenario.lifeEvents).toEqual([{ year: 1, amountCents: -20_000_00, label: 'Car' }])
    expect(from.scenario.housePurchaseYear).toBe(3)
    expect(from.scenario.monthlyContributionCents).toBe(Math.round(1_000_00 * 1.05 ** 2))
  })

  it('is nothing without a dated plan, a check-in, or one before the plan started', () => {
    expect(planFromToday(null, { investedCents: 1, date: '2026-01-01' })).toBeNull()
    expect(planFromToday(makeScenario({ planStartDate: null }), { investedCents: 1, date: '2026-01-01' })).toBeNull()
    expect(planFromToday(plan, null)).toBeNull()
    expect(planFromToday(plan, { investedCents: 1, date: '2023-06-01' })).toBeNull()
  })
})
