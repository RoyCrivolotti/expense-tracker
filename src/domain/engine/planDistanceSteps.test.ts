import { describe, expect, it } from 'vitest'
import { samplePlan, SAMPLE_INFLATION } from '../../testing/samplePlan'
import { measurePlanDistance, planDistance } from './planDistance'
import { monthBand, nearStep, readAgainst } from './planStepWindow'
import { planLineOf, planValueAt, planValueBefore, stretchAround } from './planLine'
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

  /** The first time on the way from `from` to `to` at which the line passes the test, found by walking it in small steps. */
  function walk(line: ReturnType<typeof planLineOf>, from: number, to: number, step: number, passes: (v: number) => boolean): number | null {
    for (let t = from; step > 0 ? t <= to : t >= to; t += step) {
      if (passes(planValueAt(line, t)!)) return t
    }
    return null
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

      const expected =
        balance >= here
          ? walk(line, offset, stretch.to - STEP, STEP, (v) => v >= balance)
          : walk(line, offset, stretch.from, -STEP, (v) => v <= balance)
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

describe('measurePlanDistance across a step too small to end a stretch', () => {
  // 120 a year, with a step of +15 (under three months of that rise) on the anniversary of year 2.
  const line = planLineOf([
    { year: 0, investedCents: 1000 },
    { year: 1, investedCents: 1120 },
    { year: 2, investedCents: 1255, preEventInvestedCents: 1240 },
    { year: 3, investedCents: 1375 },
  ])

  it('counts months ahead to a balance the step jumped over, as the day of the step', () => {
    // 1.245 is between 1.240 (before the step) and 1.255 (after it): the line has it on the anniversary.
    const result = measurePlanDistance(line, 1.5, 1245)
    expect(result.kind).toBe('along')
    if (result.kind === 'along') expect(result.atOffset).toBe(2)
  })

  it('counts months behind from a balance the step jumped over, as the day of the step', () => {
    const result = measurePlanDistance(line, 2.5, 1245)
    expect(result.kind).toBe('along')
    if (result.kind === 'along') expect(result.atOffset).toBe(2)
  })

  it('still finds a balance on the way, either side of it', () => {
    expect(measurePlanDistance(line, 1.5, 1200)).toMatchObject({ kind: 'along' })
    expect(measurePlanDistance(line, 2.5, 1300)).toMatchObject({ kind: 'along' })
  })
})

describe('measurePlanDistance when the balance is reached only after a step in the last year', () => {
  it('says a step is why, not that the balance is off the line, when the line has it only just after the step', () => {
    // A 300.000 euro bonus in year 9 of a 10-year plan: a balance a little above the value after it is on the line
    // only in the year that follows the bonus, the last one.
    const points = project({ housePurchaseYear: null, horizonYears: 10, lifeEvents: [{ year: 9, amountCents: 30_000_000, label: 'Bonus' }] })
    const line = planLineOf(points)
    const lead = points[9]!.investedCents + 100_000
    expect(lead).toBeLessThan(points[10]!.preEventInvestedCents)
    expect(measurePlanDistance(line, 9 - WEEK, lead)).toEqual({ kind: 'unmeasured', reason: 'across-event' })
    // A balance far above anything the plan ever holds is not on the line at all.
    expect(measurePlanDistance(line, 9 - WEEK, points[10]!.investedCents * 2)).toEqual({ kind: 'unmeasured', reason: 'outside-line' })
  })
})

describe('monthBand', () => {
  const line = planLineOf(project())

  it('is a month of what the line rises by in the year the date is in', () => {
    const points = project()
    expect(monthBand(line, 3.4)).toBeCloseTo((points[4]!.preEventInvestedCents - points[3]!.investedCents) / 12, 0)
  })

  it('is a month of the rise of the year before a house payment too, up to the value before the payment and not the one after it', () => {
    const points = project()
    // In year 8 the purchase takes 71.000 euros off the portfolio, so the two readings of the year's rise differ by a great deal.
    const rise = points[8]!.preEventInvestedCents - points[7]!.investedCents
    expect(rise).not.toBe(points[8]!.investedCents - points[7]!.investedCents)
    expect(monthBand(line, 7.5)).toBeCloseTo(rise / 12, 0)
  })

  it('has a floor, so a line that does not move still has a few cents of room for rounding', () => {
    expect(monthBand(planLineOf([{ year: 0, investedCents: 5000 }, { year: 1, investedCents: 5000 }]), 0.5)).toBe(100)
  })

  it('reads the last year at the last day, where there is no year after it', () => {
    expect(monthBand(line, 30)).toBeGreaterThan(0)
  })
})

describe('readAgainst', () => {
  const line = planLineOf(project())

  it('is symmetric: a balance 0,9 months either side of the line is on track just after a stretch begins, as anywhere', () => {
    const t = 8 + 0.12
    const here = planValueAt(line, t)!
    const band = monthBand(line, t)
    expect(readAgainst(line, t, Math.round(here - band * 0.9))!.onTrack).toBe(true)
    expect(readAgainst(line, t, Math.round(here + band * 0.9))!.onTrack).toBe(true)
    expect(readAgainst(line, t, Math.round(here - band * 1.2))!.onTrack).toBe(false)
  })

  it('reads a balance on plan as on track everywhere along the line', () => {
    for (const t of [0, 0.3, 3, 7.95, 8, 8.05, 20, 29.9, 30]) {
      expect(readAgainst(line, t, planValueAt(line, t)!)).toMatchObject({ onTrack: true, nearStep: null })
    }
  })

  it('reads a purchase made a fortnight early against the plan with it made', () => {
    const t = 8 - 14 / 365
    const made = nearStep(line, t)!
    expect(made).toMatchObject({ anniversary: 8, counted: 'made' })
    const result = readAgainst(line, t, made.alternate)!
    expect(result.nearStep).toMatchObject({ anniversary: 8, counted: 'made' })
    expect(result.reference).toBe(made.alternate)
    expect(result.onTrack).toBe(true)
  })

  it('carries the line from after the step back by the rise of the year after it, to a balance ten days before the purchase', () => {
    const points = project()
    const t = 8 - 10 / 365
    // The plan with the purchase already made: the value after it, less ten days of the year's rise that follows it.
    const rise = points[9]!.preEventInvestedCents - points[8]!.investedCents
    const made = Math.round(points[8]!.investedCents - (10 / 365) * rise)
    expect(Math.abs(nearStep(line, t)!.alternate - made)).toBeLessThanOrEqual(1)
    const result = readAgainst(line, t, made)!
    expect(result.nearStep).toMatchObject({ anniversary: 8, counted: 'made' })
    expect(Math.abs(result.reference - made)).toBeLessThanOrEqual(1)
    expect(result.onTrack).toBe(true)
  })

  it('carries the line from before the step on by the rise of the year before it, to a balance ten days after the purchase', () => {
    const points = project()
    const t = 8 + 10 / 365
    const rise = points[8]!.preEventInvestedCents - points[7]!.investedCents
    const notMade = Math.round(points[8]!.preEventInvestedCents + (10 / 365) * rise)
    expect(Math.abs(nearStep(line, t)!.alternate - notMade)).toBeLessThanOrEqual(1)
  })

  it('reads a purchase a fortnight late, still not made, against the plan without it', () => {
    const t = 8 + 14 / 365
    const notYet = nearStep(line, t)!
    expect(notYet).toMatchObject({ anniversary: 8, counted: 'not-made' })
    const result = readAgainst(line, t, notYet.alternate)!
    expect(result.nearStep).toMatchObject({ counted: 'not-made' })
    expect(result.onTrack).toBe(true)
  })

  it('reads a check-in on the anniversary that has not paid yet as on track too', () => {
    const before = planValueBefore(line, 8)!
    const result = readAgainst(line, 8, before)!
    expect(result.nearStep).toMatchObject({ anniversary: 8, counted: 'not-made' })
    expect(result.onTrack).toBe(true)
  })

  it('does not stretch the window past a month, or to a step that is too small to end a stretch', () => {
    expect(nearStep(line, 8 - 45 / 365)).toBeNull()
    expect(nearStep(line, 8 + 45 / 365)).toBeNull()
    const bonus = planLineOf(project({ housePurchaseYear: null, lifeEvents: [{ year: 5, amountCents: 200_000, label: 'Bonus' }] }))
    expect(nearStep(bonus, 5 - 7 / 365)).toBeNull()
  })

  it('keeps the plain reading for a balance that is on neither path', () => {
    const t = 8 - 14 / 365
    const main = planValueAt(line, t)!
    // 10.000 euros under the line, more than a month of what it rises by (about 1.500).
    const result = readAgainst(line, t, main - 1_000_000)!
    expect(result.nearStep).toBeNull()
    expect(result.reference).toBe(main)
    expect(result.onTrack).toBe(false)
  })

  it('uses the other path only for a balance that is close to it, not merely nearer to it than to the line', () => {
    // Half way between the two paths is on neither, so it is read against the line, whichever is nearer.
    const t = 8 - 14 / 365
    const main = planValueAt(line, t)!
    const alternate = nearStep(line, t)!.alternate
    const between = Math.round(alternate + (main - alternate) * 0.45)
    expect(readAgainst(line, t, between)!.nearStep).toBeNull()
    // A balance within three months of the line's rise of the other path is on it.
    const close = alternate + Math.round(monthBand(line, t) * 2.5)
    expect(readAgainst(line, t, close)!.nearStep).toMatchObject({ counted: 'made' })
    expect(readAgainst(line, t, alternate + Math.round(monthBand(line, t) * 3.5))!.nearStep).toBeNull()
  })

  it('has nothing for a day outside the plan', () => {
    expect(readAgainst(line, -1, 5)).toBeNull()
    expect(readAgainst(line, 31, 5)).toBeNull()
  })
})
