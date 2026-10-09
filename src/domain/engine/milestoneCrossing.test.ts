import { describe, expect, it } from 'vitest'
import { samplePlan, SAMPLE_INFLATION } from '../../testing/samplePlan'
import { milestoneCrossing } from './milestoneCrossing'
import { planLineOf, planValueAt } from './planLine'
import { projectNetWorth } from './projection'
import { scenarioToParams } from './scenarioProjection'

const lineOf = (over = {}, inflation = SAMPLE_INFLATION) =>
  planLineOf(projectNetWorth(scenarioToParams(samplePlan(over), inflation)))
const G = 1 + SAMPLE_INFLATION
const screenAt = (line: ReturnType<typeof planLineOf>, t: number) => planValueAt(line, t)! * Math.pow(G, t)

describe('milestoneCrossing', () => {
  it('dates a milestone on the line in euros on the account, which is later in the plan than the line itself', () => {
    // 500.000 euros on the account in a plan with no house: the line, worth less than the account shows,
    // has only about 500.000 / 1,02^t of it, so the account reaches it sooner than the line does.
    const line = lineOf({ housePurchaseYear: null })
    const onScreen = milestoneCrossing(line, 50_000_000, SAMPLE_INFLATION)!
    const onLine = milestoneCrossing(line, 50_000_000, 0)!
    expect(onScreen.offset).toBeLessThan(onLine.offset)
    expect(onScreen.offset).toBeGreaterThan(0)
  })

  it('is the closed form for a plan that grows with nothing paid in, within what a straight chord allows', () => {
    // 50.000 at 5% a year after inflation, 2% inflation, no payments in: t = ln(A / P) / ln((1 + r)(1 + i)).
    const line = lineOf({ housePurchaseYear: null, monthlyContributionCents: 0 })
    const amount = 200_000_00
    const exact = Math.log(amount / 5_000_000) / Math.log(1.05 * 1.02)
    const found = milestoneCrossing(line, amount, SAMPLE_INFLATION)!
    expect(Math.abs(found.offset - exact)).toBeLessThan(0.08)
  })

  it('is the same as the line reaching the amount when there is no inflation', () => {
    const line = lineOf({ housePurchaseYear: null }, 0)
    const found = milestoneCrossing(line, 25_000_000, 0)!
    // The amount is reached where the straight line first gets there.
    expect(planValueAt(line, found.offset)!).toBeGreaterThanOrEqual(25_000_000 - 1)
    expect(planValueAt(line, found.offset - 0.002)!).toBeLessThan(25_000_000)
  })

  it('reaches a bigger amount no sooner than a smaller one', () => {
    const line = lineOf()
    let previous = -1
    for (const amount of [8_000_000, 10_000_000, 15_000_000, 25_000_000, 50_000_000, 100_000_000]) {
      const found = milestoneCrossing(line, amount, SAMPLE_INFLATION)
      if (found === null) break
      expect(found.offset).toBeGreaterThanOrEqual(previous)
      previous = found.offset
    }
  })

  it('has the amount on the first day when the plan starts above it, and never for one it does not reach', () => {
    const line = lineOf()
    expect(milestoneCrossing(line, 4_000_000, SAMPLE_INFLATION)).toMatchObject({ offset: 0, staysAbove: true })
    expect(milestoneCrossing(line, 99_000_000_000, SAMPLE_INFLATION)).toBeNull()
  })

  it('reaches an amount a step up jumps over on the anniversary of the step', () => {
    // A 30.000 bonus in year 5 takes the line from just under 130.000 to over 150.000 in one day.
    const line = lineOf({ housePurchaseYear: null, lifeEvents: [{ year: 5, amountCents: 3_000_000, label: 'Bonus' }] })
    const before = screenAt(line, 5 - 1e-9)
    const after = screenAt(line, 5)
    const amount = Math.round((before + after) / 2)
    expect(before).toBeLessThan(amount)
    expect(after).toBeGreaterThan(amount)
    expect(milestoneCrossing(line, amount, SAMPLE_INFLATION)!.offset).toBe(5)
  })

  it('says a milestone the plan reaches and then loses to a house payment dips below again, and when', () => {
    // 150.000 euros on the account is reached in year 6, but the house payment in year 8 takes the plan under it.
    const line = lineOf()
    const found = milestoneCrossing(line, 15_000_000, SAMPLE_INFLATION)!
    expect(found.offset).toBeGreaterThan(5)
    expect(found.offset).toBeLessThan(8)
    expect(found.staysAbove).toBe(false)
    expect(found.dipsAt).toBe(8)
  })

  it('stays above a milestone the plan reaches after the payment', () => {
    const line = lineOf()
    const found = milestoneCrossing(line, 50_000_000, SAMPLE_INFLATION)!
    expect(found.offset).toBeGreaterThan(8)
    expect(found).toMatchObject({ staysAbove: true, dipsAt: null })
  })

  it('works on a plan with no years', () => {
    const line = planLineOf([{ year: 0, investedCents: 1000 }])
    expect(milestoneCrossing(line, 500, 0.02)).toMatchObject({ offset: 0, staysAbove: true })
    expect(milestoneCrossing(line, 5000, 0.02)).toBeNull()
  })
})

describe('milestoneCrossing on a line that falls', () => {
  // At 10% inflation the account grows a year of the line's fall back: a line that falls by 9,1% in a year
  // still has a little hump on the account in the middle of it, and one that falls by 20% only falls.
  const inflation = 0.1
  const g = 1 + inflation
  const humped = planLineOf([
    { year: 0, investedCents: 1_000_000 },
    { year: 1, investedCents: 909_000 },
  ])
  const falling = planLineOf([
    { year: 0, investedCents: 1_000_000 },
    { year: 1, investedCents: 800_000 },
  ])
  const walk = (line: ReturnType<typeof planLineOf>, test: (screen: number) => boolean, from = 0) => {
    for (let t = from; t <= 1; t += 1 / 100_000) if (test(planValueAt(line, t)! * Math.pow(g, t))) return t
    return null
  }

  it('reaches an amount the hump gets over, and falls back below it before the year is out', () => {
    // The account is at 1.000.000 at the start, about 1.001.100 at the top of the hump and 999.900 at the end.
    const amount = 1_000_500
    const found = milestoneCrossing(humped, amount, inflation)!
    // The walk reads the line in whole cents, which on the flat top of a hump moves the day by a few thousandths of a year.
    const rose = walk(humped, (v) => v >= amount)!
    expect(Math.abs(found.offset - rose)).toBeLessThan(2e-3)
    expect(found.staysAbove).toBe(false)
    const fell = walk(humped, (v) => v < amount, found.offset + 1e-4)!
    expect(Math.abs(found.dipsAt! - fell)).toBeLessThan(2e-3)
    expect(found.dipsAt!).toBeGreaterThan(found.offset)
  })

  it('never reaches an amount above the hump', () => {
    expect(milestoneCrossing(humped, 1_002_000, inflation)).toBeNull()
  })

  it('is above an amount the line starts over and falls back under it, with the day it does', () => {
    const found = milestoneCrossing(falling, 900_000, inflation)!
    expect(found.offset).toBe(0)
    expect(found.staysAbove).toBe(false)
    const fell = walk(falling, (v) => v < 900_000)!
    expect(Math.abs(found.dipsAt! - fell)).toBeLessThan(1e-4)
  })

  it('does not reach an amount a falling line never gets back to', () => {
    expect(milestoneCrossing(falling, 1_100_000, inflation)).toBeNull()
  })

  it('holds on a line that falls when the account does not fall below the amount by the end', () => {
    expect(milestoneCrossing(falling, 700_000, inflation)).toMatchObject({ offset: 0, staysAbove: true })
    expect(g).toBeCloseTo(1.1)
  })
})

describe('milestoneCrossing against a walk of the account day by day', () => {
  function rng(seed: number) {
    let s = seed
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296
      return s / 4294967296
    }
  }
  const STEP = 1 / 3650

  it('finds the first day, and the day it falls back, on random plans with a payment and an event', () => {
    const rand = rng(23)
    for (let n = 0; n < 120; n++) {
      const inflation = rand() * 0.05
      const g = 1 + inflation
      const line = lineOf(
        {
          horizonYears: 25,
          housePurchaseYear: 1 + Math.floor(rand() * 18),
          startInvestedCents: Math.round(1_000_000 + rand() * 20_000_000),
          monthlyContributionCents: Math.round(rand() * 250_000),
          expectedRealReturn: rand() * 0.09,
          lifeEvents: [{ year: 1 + Math.floor(rand() * 20), amountCents: Math.round((rand() - 0.5) * 8_000_000), label: 'Event' }],
        },
        inflation,
      )
      const top = Math.max(...Array.from({ length: 26 }, (_, y) => planValueAt(line, y)! * Math.pow(g, y)))
      const amount = Math.round(2_000_000 + rand() * Math.max(1, top - 1_000_000))
      const found = milestoneCrossing(line, amount, inflation)

      let firstDay: number | null = null
      for (let t = 0; t <= 25; t += STEP) {
        if (planValueAt(line, t)! * Math.pow(g, t) >= amount) {
          firstDay = t
          break
        }
      }
      if (firstDay === null) {
        expect(found).toBeNull()
        continue
      }
      expect(found).not.toBeNull()
      expect(Math.abs(found!.offset - firstDay)).toBeLessThan(STEP * 2)

      let dipDay: number | null = null
      for (let t = found!.offset + STEP; t <= 25; t += STEP) {
        if (planValueAt(line, t)! * Math.pow(g, t) < amount) {
          dipDay = t
          break
        }
      }
      expect(found!.staysAbove).toBe(dipDay === null)
      if (dipDay !== null) expect(Math.abs(found!.dipsAt! - dipDay)).toBeLessThan(STEP * 3)
    }
  })
})
