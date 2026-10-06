import { describe, expect, it } from 'vitest'
import type { NewGoalScenario } from '../data/dataSource'
import { planFromToday } from './planFromToday'
import { restartFromLatest } from './restartFromLatest'
import { makeScenario } from '../../testing/factories'

const latest = { investedCents: 160_000_00, date: '2026-01-01' }

const saved = makeScenario({
  id: 7,
  name: 'Path A',
  color: '#123456',
  isActive: true,
  planStartDate: '2024-01-01',
  startInvestedCents: 100_000_00,
  monthlyContributionCents: 1_000_00,
  annualContributionGrowth: 0.05,
  expectedRealReturn: 0.06,
  horizonYears: 25,
  lifeEvents: [{ year: 1, amountCents: 5_000_00, label: 'Bonus' }, { year: 3, amountCents: -20_000_00, label: 'Car' }],
  housePurchaseYear: 5,
})

describe('restartFromLatest', () => {
  it('starts a dated scenario from the check-in and keeps everything that is not the start', () => {
    const restarted = restartFromLatest(saved, latest)
    expect(restarted.startInvestedCents).toBe(160_000_00)
    expect(restarted.planStartDate).toBe('2026-01-01')
    expect(restarted).toMatchObject({
      id: 7,
      name: 'Path A',
      color: '#123456',
      isActive: true,
      expectedRealReturn: 0.06,
      horizonYears: 25,
    })
  })

  it('leaves the scenario it was given alone', () => {
    const before = JSON.stringify(saved)
    restartFromLatest(saved, latest)
    expect(JSON.stringify(saved)).toBe(before)
  })

  it('carries events, the house and the contribution as a re-baseline would', () => {
    const restarted = restartFromLatest(saved, latest)
    // The bonus is behind the check-in and already in the balance; the car and the house keep their dates.
    expect(restarted.lifeEvents).toEqual([{ year: 1, amountCents: -20_000_00, label: 'Car' }])
    expect(restarted.housePurchaseYear).toBe(3)
    expect(restarted.monthlyContributionCents).toBe(Math.round(1_000_00 * 1.05 ** 2))
  })

  it('draws the same scenario the plan-from-today line does', () => {
    expect(restartFromLatest(saved, latest)).toEqual(planFromToday(saved, latest)!.scenario)
  })

  it('restarts the editor draft, which has no id', () => {
    const draft = Object.fromEntries(
      Object.entries(saved).filter(([key]) => key !== 'id' && key !== 'isActive'),
    ) as NewGoalScenario
    const restarted = restartFromLatest(draft, latest)
    expect(restarted.startInvestedCents).toBe(160_000_00)
    expect(restarted.planStartDate).toBe('2026-01-01')
    expect('id' in restarted).toBe(false)
  })

  it('restarts a scenario with no start date, keeping its events where they are', () => {
    const undated = makeScenario({
      planStartDate: null,
      startInvestedCents: 50_000_00,
      lifeEvents: [{ year: 2, amountCents: 1_000_00, label: 'Gift' }],
      housePurchaseYear: 4,
    })
    const restarted = restartFromLatest(undated, latest)
    expect(restarted.startInvestedCents).toBe(160_000_00)
    expect(restarted.planStartDate).toBe('2026-01-01')
    expect(restarted.lifeEvents).toEqual(undated.lifeEvents)
    expect(restarted.housePurchaseYear).toBe(4)
  })

  it('leaves a scenario that starts after the check-in as it is', () => {
    const future = makeScenario({ planStartDate: '2026-06-01', startInvestedCents: 10_000_00 })
    expect(restartFromLatest(future, latest)).toBe(future)
  })

  it('restarts a scenario that starts on the check-in date without moving it', () => {
    const same = makeScenario({ planStartDate: '2026-01-01', startInvestedCents: 10_000_00 })
    const restarted = restartFromLatest(same, latest)
    expect(restarted.startInvestedCents).toBe(160_000_00)
    expect(restarted.planStartDate).toBe('2026-01-01')
  })

  it('is the scenario itself without a check-in', () => {
    expect(restartFromLatest(saved, null)).toBe(saved)
  })
})
