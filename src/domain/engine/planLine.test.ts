import { describe, expect, it } from 'vitest'
import { samplePlan, SAMPLE_INFLATION } from '../../testing/samplePlan'
import { lineValues, planLineOf, planValueAt, planValueBefore, stretchAround } from './planLine'
import { projectNetWorth } from './projection'
import { scenarioToParams } from './scenarioProjection'

const project = (over = {}) => projectNetWorth(scenarioToParams(samplePlan(over), SAMPLE_INFLATION))

/** The line the app drew before: a straight chord between the year-end values. Kept here as the oracle for plans with no step. */
function oldChord(points: { year: number; investedCents: number }[], t: number): number {
  const i = Math.floor(t)
  const here = points[i]!.investedCents
  if (i >= points.length - 1) return here
  return Math.round(here + (t - i) * (points[i + 1]!.investedCents - here))
}

describe('planLineOf and planValueAt', () => {
  it('is the straight line between the year-end values when no year has a payment or event', () => {
    const points = project({ housePurchaseYear: null })
    const line = planLineOf(points)
    for (let step = 0; step <= 30 * 24; step++) {
      const t = step / 24
      expect(planValueAt(line, t)).toBe(oldChord(points, t))
    }
  })

  it('rises through the year of a house payment and drops on its anniversary', () => {
    const points = project()
    const line = planLineOf(points)
    const before = points[7]!.investedCents
    const pre = points[8]!.preEventInvestedCents
    const post = points[8]!.investedCents
    // At the start of year 8 (the anniversary of year 7) the line is at the year 7 value, and it
    // climbs towards the value before the payment, not towards the value after it.
    expect(planValueAt(line, 7)).toBe(before)
    expect(planValueAt(line, 7.5)).toBe(Math.round(before + 0.5 * (pre - before)))
    expect(planValueAt(line, 7 + 51 / 52)).toBeGreaterThan(Math.round(before + 0.9 * (pre - before)))
    // On the anniversary the payment has been made.
    expect(planValueAt(line, 8)).toBe(post)
    expect(post).toBeLessThan(pre)
  })

  it('steps up on the anniversary of an inflow', () => {
    const points = project({ housePurchaseYear: null, lifeEvents: [{ year: 5, amountCents: 3_000_000, label: 'Bonus' }] })
    const line = planLineOf(points)
    expect(planValueAt(line, 5)).toBe(points[5]!.investedCents)
    expect(planValueAt(line, 5)! - planValueAt(line, 5 - 1 / 365)!).toBeGreaterThan(2_900_000)
  })

  it('has the value after the step at the last year too', () => {
    const points = project({ housePurchaseYear: null, horizonYears: 10, lifeEvents: [{ year: 10, amountCents: -1_000_000, label: 'Car' }] })
    const line = planLineOf(points)
    expect(planValueAt(line, 10)).toBe(points[10]!.investedCents)
  })

  it.each([
    ['before the plan starts', -0.01],
    ['past the last year', 30.01],
    ['not a number', Number.NaN],
  ])('has no value %s', (_name, t) => {
    expect(planValueAt(planLineOf(project()), t)).toBeNull()
  })

  it('treats points with no step recorded as having none', () => {
    const line = planLineOf([
      { year: 0, investedCents: 1000 },
      { year: 1, investedCents: 2000 },
    ])
    expect(planValueAt(line, 0.5)).toBe(1500)
  })

  it.each([
    ['no points', []],
    ['points that do not start at year 0', [{ year: 2, investedCents: 1000 }]],
    ['a year missing', [{ year: 0, investedCents: 1000 }, { year: 2, investedCents: 3000 }]],
  ])('is no line for %s', (_name, points) => {
    expect(planValueAt(planLineOf(points), 0)).toBeNull()
    expect(planValueAt(planLineOf(points), 1)).toBeNull()
  })

  it('has no segments for a single point', () => {
    expect(planValueAt(planLineOf([{ year: 0, investedCents: 1000 }]), 0)).toBe(1000)
  })
})

describe('stretchAround', () => {
  it('is the whole plan when nothing steps', () => {
    expect(stretchAround(planLineOf(project({ housePurchaseYear: null })), 12.3)).toEqual({ from: 0, to: 30 })
  })

  it('runs from one step to the next', () => {
    const line = planLineOf(project({ lifeEvents: [{ year: 12, amountCents: -1_000_000, label: 'Car' }] }))
    expect(stretchAround(line, 3)).toEqual({ from: 0, to: 8 })
    expect(stretchAround(line, 9.5)).toEqual({ from: 8, to: 12 })
    expect(stretchAround(line, 20)).toEqual({ from: 12, to: 30 })
  })

  it('puts an anniversary with a step into the stretch that starts there', () => {
    const line = planLineOf(project())
    expect(stretchAround(line, 8)).toEqual({ from: 8, to: 30 })
  })

  it('does not call a step on a day that is not an anniversary a stretch of its own', () => {
    expect(stretchAround(planLineOf(project()), 7.99)).toEqual({ from: 0, to: 8 })
  })
})

describe('lineValues', () => {
  it('gives the year-end values, and the values before a step only where some year has one', () => {
    const plain = lineValues(project({ housePurchaseYear: null }))
    expect(plain.preStep).toBeUndefined()
    const stepped = project()
    const result = lineValues(stepped)
    expect(result.values).toEqual(stepped.map((p) => p.investedCents))
    expect(result.preStep).toEqual(stepped.map((p) => p.preEventInvestedCents))
    expect(result.preStep![8]).toBeGreaterThan(result.values[8]!)
  })
})

describe('planValueBefore', () => {
  it('is the value the day before a step on the anniversary, and the plain value on any other day', () => {
    const points = project()
    const line = planLineOf(points)
    expect(planValueBefore(line, 8)).toBe(points[8]!.preEventInvestedCents)
    expect(planValueBefore(line, 8)).toBeGreaterThan(planValueAt(line, 8)!)
    expect(planValueBefore(line, 7.5)).toBe(planValueAt(line, 7.5))
    expect(planValueBefore(line, 3)).toBe(planValueAt(line, 3))
  })

  it('is the value at the start on the first day, and nothing outside the plan', () => {
    const line = planLineOf(project())
    expect(planValueBefore(line, 0)).toBe(planValueAt(line, 0))
    expect(planValueBefore(line, -1)).toBeNull()
    expect(planValueBefore(line, 31)).toBeNull()
  })
})

describe('stretchAround and small steps', () => {
  // A line that rises 120 a year (10 a month) with a step of the given size on the anniversary of year 2.
  const withStep = (step: number) =>
    planLineOf([
      { year: 0, investedCents: 1000 },
      { year: 1, investedCents: 1120 },
      { year: 2, investedCents: 1240 + step, preEventInvestedCents: 1240 },
      { year: 3, investedCents: 1360 + step },
    ])

  it('does not end a stretch at a step smaller than three months of the line\u2019s rise', () => {
    // A 29 step is under 3 x 10, a bonus or a gift that months can still be counted across.
    expect(stretchAround(withStep(29), 0.5)).toEqual({ from: 0, to: 3 })
    expect(stretchAround(withStep(-29), 0.5)).toEqual({ from: 0, to: 3 })
  })

  it('ends one at a step of three months of the rise or more', () => {
    expect(stretchAround(withStep(30), 0.5)).toEqual({ from: 0, to: 2 })
    expect(stretchAround(withStep(-300), 2.5)).toEqual({ from: 2, to: 3 })
  })

  it('counts a 2.000 euro bonus as part of the stretch it is in, and a house payment as the end of it', () => {
    const bonus = planLineOf(project({ housePurchaseYear: null, lifeEvents: [{ year: 5, amountCents: 200_000, label: 'Bonus' }] }))
    expect(stretchAround(bonus, 3)).toEqual({ from: 0, to: 30 })
    expect(stretchAround(planLineOf(project()), 3)).toEqual({ from: 0, to: 8 })
  })
})
