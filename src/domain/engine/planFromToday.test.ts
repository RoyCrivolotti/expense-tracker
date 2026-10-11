import { describe, expect, it } from 'vitest'
import { planFromToday, planFromTodayAt } from './planFromToday'
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
  lifeEvents: [{ year: 1, amountCents: 5_000_00, label: 'Bonus' }, { year: 3, amountCents: -20_000_00, label: 'Car' }],
  housePurchaseYear: 5,
  isActive: true,
})

describe('planFromToday', () => {
  it('counts what it restarts in the euros of the check-in: spending 30.000 of 2024 is 31.836 in 2027', () => {
    const from = planFromToday({ ...plan, annualSpendCents: 3_000_000 }, { investedCents: 160_000_00, date: '2027-01-01' }, 0.02)!
    expect(from.scenario.annualSpendCents).toBe(3_183_624)
  })

  it('restarts the plan from the check-in with its balance and date, and leaves the plan alone', () => {
    const latest = { investedCents: 160_000_00, date: '2026-01-01' }
    const from = planFromToday(plan, latest, DEFAULT_INFLATION_RATE)!
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

  it('makes a plan from a check-in dated on the plan\'s own start day, which is how a plan usually begins', () => {
    const from = planFromToday(plan, { investedCents: 100_000_00, date: plan.planStartDate! }, DEFAULT_INFLATION_RATE)!
    expect(from).not.toBeNull()
    expect(from.offsetYears).toBe(0)
    expect(from.scenario.planStartDate).toBe(plan.planStartDate)
    expect(planFromToday(plan, { investedCents: 100_000_00, date: '2023-12-31' }, DEFAULT_INFLATION_RATE)).toBeNull()
  })

  it('carries what a re-baseline would: events on their dates, the monthly amount in force and the changes to come', () => {
    const stepped = {
      ...plan,
      contributionSchedule: [
        { from: '2024-07', monthlyCents: 1_500_00 },
        { from: '2027-03', monthlyCents: 2_500_00 },
      ],
    }
    const from = planFromToday(stepped, { investedCents: 1, date: '2026-01-01' }, DEFAULT_INFLATION_RATE)!
    // The bonus is behind the check-in and already in the balance; the car and the house keep their dates.
    // The car's 20.000 of 2024 is 20.808 in the euros of the check-in two years on.
    expect(from.scenario.lifeEvents).toEqual([{ year: 1, amountCents: -20_808_00, label: 'Car' }])
    expect(from.scenario.housePurchaseYear).toBe(3)
    expect(from.scenario.monthlyContributionCents).toBe(1_500_00)
    expect(from.scenario.contributionSchedule).toEqual([{ from: '2027-03', monthlyCents: 2_500_00 }])
  })

  it('is nothing without a dated plan, a check-in, or one before the plan started', () => {
    expect(planFromToday(null, { investedCents: 1, date: '2026-01-01' }, DEFAULT_INFLATION_RATE)).toBeNull()
    expect(planFromToday(makeScenario({ planStartDate: null }), { investedCents: 1, date: '2026-01-01' }, DEFAULT_INFLATION_RATE)).toBeNull()
    expect(planFromToday(plan, null, DEFAULT_INFLATION_RATE)).toBeNull()
    expect(planFromToday(plan, { investedCents: 1, date: '2023-06-01' }, DEFAULT_INFLATION_RATE)).toBeNull()
  })
})

describe('planFromTodayAt', () => {
  it('is the same restart when the rate is the one it was made at, and a fresh one at another', () => {
    const latest = { investedCents: 160_000_00, date: '2027-01-01' }
    const saved = planFromToday({ ...plan, annualSpendCents: 3_000_000 }, latest, 0.02)!
    expect(planFromTodayAt(saved, 0.02)).toBe(saved)
    const tried = planFromTodayAt(saved, 0.06)
    expect(tried.scenario.annualSpendCents).toBe(Math.round(3_000_000 * 1.06 ** 3))
    expect(tried.inflationRate).toBe(0.06)
    expect(tried.offsetYears).toBe(saved.offsetYears)
  })
})

