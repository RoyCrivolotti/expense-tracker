import { describe, expect, it } from 'vitest'
import { samplePlan, SAMPLE_INFLATION } from '../../testing/samplePlan'
import { measurePlanDistance, planDistance } from './planDistance'
import { planLineOf, planValueAt, stretchAround } from './planLine'
import { projectNetWorth } from './projection'
import { scenarioToParams } from './scenarioProjection'

const project = (over = {}) => projectNetWorth(scenarioToParams(samplePlan(over), SAMPLE_INFLATION))
const WEEK = 7 / 365

describe('measurePlanDistance across a house payment', () => {
  const line = planLineOf(project())
  const before = 8 - WEEK
  const here = planValueAt(line, before)!

  it('reads 0 for someone exactly on plan a week before the payment', () => {
    expect(measurePlanDistance(line, before, here)).toEqual({ kind: 'along', months: 0, atOffset: before })
  })

  it('measures a small lead in months when the line gets there before the payment', () => {
    // The line still climbs by about 350 euros in that last week, so a lead of 200 is one it reaches.
    const result = measurePlanDistance(line, before, here + 20_000)
    expect(result.kind).toBe('along')
    if (result.kind === 'along') {
      expect(result.months).toBeGreaterThan(0)
      expect(result.months).toBeLessThan(1)
    }
  })

  it('does not measure months across the payment: a lead the line only reaches after it', () => {
    // 5.000 euros more than the line holds a week before it drops by 70.871: the line next has that in year 9 or later.
    const result = measurePlanDistance(line, before, planValueAt(line, 8 - 1 / 365)! + 500_000)
    expect(result).toEqual({ kind: 'unmeasured', reason: 'across-event' })
  })

  it('does not measure months back across the payment either', () => {
    const after = 8 + 7 / 365
    const result = measurePlanDistance(line, after, planValueAt(line, after)! - 1_000_000)
    expect(result).toEqual({ kind: 'unmeasured', reason: 'across-event' })
  })

  it('measures a lag in months when the line was at that balance after the payment', () => {
    const result = measurePlanDistance(line, 8.5, planValueAt(line, 8)! + 100_000)
    expect(result.kind).toBe('along')
    if (result.kind === 'along') expect(result.months).toBeLessThan(0)
  })

  it('has nothing to say for a balance no year of the plan holds', () => {
    expect(measurePlanDistance(line, before, 99_000_000_000)).toEqual({ kind: 'unmeasured', reason: 'outside-line' })
    expect(measurePlanDistance(line, 12, 1)).toEqual({ kind: 'unmeasured', reason: 'outside-line' })
  })

  it.each([
    ['before the plan starts', -0.5],
    ['at the last year', 30],
    ['past it', 31],
  ])('has no line to measure against %s', (_name, offset) => {
    expect(measurePlanDistance(line, offset, 5_000_000)).toEqual({ kind: 'unmeasured', reason: 'outside-line' })
  })
})

describe('measurePlanDistance across a bonus', () => {
  const line = planLineOf(project({ housePurchaseYear: null, lifeEvents: [{ year: 5, amountCents: 3_000_000, label: 'Bonus' }] }))

  it('is 0 on plan the week before it and does not measure a deficit that only the bonus clears', () => {
    const before = 5 - WEEK
    expect(measurePlanDistance(line, before, planValueAt(line, before)!)).toMatchObject({ kind: 'along', months: 0 })
    // 1.000 euros behind a week before a 30.000 bonus: the line was at that balance earlier in the year, so it is measured.
    expect(measurePlanDistance(line, before, planValueAt(line, before)! - 100_000).kind).toBe('along')
  })

  it('does not call a lead the line only reaches after a step up by months', () => {
    // After the bonus the line is far above; before it, a lag the line was never at (lower than the stretch start) crosses the step.
    const after = 5 + WEEK
    const result = measurePlanDistance(line, after, planValueAt(line, after)! - 1_500_000)
    expect(result).toEqual({ kind: 'unmeasured', reason: 'across-event' })
  })
})

describe('planDistance', () => {
  it('stays what it was for a line given as plain points, which has no step', () => {
    const points = [100, 200, 400, 500].map((investedCents, year) => ({ year, investedCents }))
    expect(planDistance(points, 1.5, 450)).toEqual({ months: 12, atOffset: 2.5 })
  })

  it('is null where the months are not measured', () => {
    const line = planLineOf(project())
    expect(planDistance(line, 8 - WEEK, planValueAt(line, 8 - 1 / 365)! + 500_000)).toBeNull()
  })
})

describe('measurePlanDistance against a brute-force walk of the line', () => {
  // A seeded generator, so a failure can be replayed.
  function rng(seed: number) {
    let s = seed
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296
      return s / 4294967296
    }
  }

  it('finds the same first and last time as walking the stretch in small steps', () => {
    const rand = rng(7)
    const STEP = 1 / 3650
    for (let n = 0; n < 150; n++) {
      const year = 1 + Math.floor(rand() * 15)
      const plan = samplePlan({
        housePurchaseYear: year,
        horizonYears: 20,
        startInvestedCents: Math.round(2_000_000 + rand() * 20_000_000),
        monthlyContributionCents: Math.round(30_000 + rand() * 200_000),
        expectedRealReturn: 0.01 + rand() * 0.08,
      })
      const line = planLineOf(projectNetWorth(scenarioToParams(plan, SAMPLE_INFLATION)))
      const offset = rand() * 19
      const here = planValueAt(line, offset)!
      const stretch = stretchAround(line, offset)
      const balance = Math.round(here * (0.7 + rand() * 0.6))
      const result = measurePlanDistance(line, offset, balance)

      let expected: number | null = null
      if (balance >= here) {
        for (let t = offset; t <= stretch.to - STEP; t += STEP) if (planValueAt(line, t)! >= balance) { expected = t; break }
      } else {
        for (let t = offset; t >= stretch.from; t -= STEP) if (planValueAt(line, t)! <= balance) { expected = t; break }
      }
      if (expected === null) {
        expect(result.kind).toBe('unmeasured')
      } else {
        expect(result.kind).toBe('along')
        if (result.kind === 'along') expect(Math.abs(result.atOffset - expected)).toBeLessThan(STEP * 2)
      }
    }
  })

  it('is the number of months the balance is ahead of, or behind, a point of the same stretch', () => {
    const rand = rng(11)
    for (let n = 0; n < 400; n++) {
      const plan = samplePlan({ housePurchaseYear: 1 + Math.floor(rand() * 12), horizonYears: 20 })
      const line = planLineOf(projectNetWorth(scenarioToParams(plan, SAMPLE_INFLATION)))
      const offset = rand() * 19
      const { from, to } = stretchAround(line, offset)
      const other = from + rand() * (to - from - 1e-6)
      const balance = planValueAt(line, other)!
      const result = measurePlanDistance(line, offset, balance)
      expect(result.kind).toBe('along')
      if (result.kind === 'along') expect(result.months).toBeCloseTo((other - offset) * 12, 1)
    }
  })
})
