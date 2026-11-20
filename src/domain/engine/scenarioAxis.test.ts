import { describe, expect, it } from 'vitest'
import { randomPlans, samplePlan, SAMPLE_INFLATION as I, TEST_INFLATION_RATES } from '../../testing/samplePlan'
import { dateAtYears, yearsBetween } from './dates'
import type { GoalScenario } from '../types'
import { planFromToday } from './planFromToday'
import { planLineOf, planValueAt } from './planLine'
import { projectNetWorth } from './projection'
import { onAxis, scenarioAxis, valueOnAxisAt } from './scenarioAxis'
import { scenarioToParams } from './scenarioProjection'

const project = (plan: GoalScenario, rate = I) => projectNetWorth(scenarioToParams(plan, rate))

/** The offset of a start `days` after 1 January 2026, the sample plan's start. */
const yearsBetweenDays = (days: number) => yearsBetween('2026-01-01', dateAtYears('2026-01-01', days / 365))

describe('scenarioAxis', () => {
  it('puts every scenario at 0 when they all start on one day, which is how the chart reads them today', () => {
    expect(scenarioAxis(['2026-01-01', '2026-01-01', '2026-01-01'])).toEqual({ origin: '2026-01-01', offsets: [0, 0, 0] })
  })

  it('starts at the earliest start and sits each later one at the calendar years from there to its own', () => {
    const axis = scenarioAxis(['2028-07-01', '2026-01-01', '2027-01-01'])
    expect(axis.origin).toBe('2026-01-01')
    expect(axis.offsets[1]).toBe(0)
    expect(axis.offsets[2]).toBe(1)
    // Half a year of 2028 has gone by 1 July: 182 of its 366 days.
    expect(axis.offsets[0]).toBeCloseTo(2 + 182 / 366, 10)
  })

  it('sits a scenario with no start, or one that is not a day, at the origin, and has no origin without a date', () => {
    expect(scenarioAxis([null, '2027-01-01', '2027-02-30', undefined])).toEqual({ origin: '2027-01-01', offsets: [0, 0, 0, 0] })
    expect(scenarioAxis([null, null])).toEqual({ origin: null, offsets: [0, 0] })
    expect(scenarioAxis([])).toEqual({ origin: null, offsets: [] })
  })
})

describe('onAxis', () => {
  it('is a scenario’s own points, to the cent, at an offset of 0, for any plan', () => {
    for (const plan of randomPlans(11, 40)) {
      const points = project(plan)
      const own = points.flatMap((p) => [
        ...(p.preEventInvestedCents !== p.investedCents ? [{ xIndex: p.year, value: p.preEventInvestedCents }] : []),
        { xIndex: p.year, value: p.investedCents },
      ])
      expect(onAxis(points, 0, I)).toEqual(own)
    }
  })

  it('moves a later start along by its offset and brings its euros back to the origin’s', () => {
    const points = project(samplePlan({ housePurchaseYear: null }))
    const placed = onAxis(points, 2, I)
    expect(placed[0]).toEqual({ xIndex: 2, value: Math.round(points[0]!.investedCents / 1.02 ** 2) })
    expect(placed.at(-1)).toEqual({ xIndex: 32, value: Math.round(points[30]!.investedCents / 1.02 ** 2) })
  })

  it('draws a step as the value the day before, then the value after, on the same x', () => {
    const points = project(samplePlan())
    const placed = onAxis(points, 1.5, I)
    const purchase = placed.filter((p) => p.xIndex === 9.5)
    expect(purchase.map((p) => p.value)).toEqual([
      Math.round(points[8]!.preEventInvestedCents / 1.02 ** 1.5),
      Math.round(points[8]!.investedCents / 1.02 ** 1.5),
    ])
  })

  it('is what the plan from today has always drawn: a restart placed at the check-in, in the plan’s euros', () => {
    // The plan from today was the one line already drawn at a later place; it is now this one.
    for (const plan of randomPlans(5, 20)) {
      const from = planFromToday(plan, { investedCents: 9_000_000, date: dateAtYears(plan.planStartDate!, 3.4) }, I)!
      const points = project(from.scenario)
      const back = Math.pow(1 + I, from.offsetYears)
      const before = points.flatMap((p) => {
        const xIndex = from.offsetYears + p.year
        const step = p.preEventInvestedCents !== p.investedCents ? [{ xIndex, value: Math.round(p.preEventInvestedCents / back) }] : []
        return [...step, { xIndex, value: Math.round(p.investedCents / back) }]
      })
      expect(onAxis(points, from.offsetYears, I)).toEqual(before)
    }
  })
})

describe('valueOnAxisAt', () => {
  it('reads a scenario at offset 0 exactly as its own line, invested and net worth, for any plan and inflation', () => {
    for (const rate of TEST_INFLATION_RATES) {
      for (const plan of randomPlans(23, 40)) {
        const points = project(plan, rate)
        const line = planLineOf(points)
        for (let year = 0; year <= plan.horizonYears; year++) {
          expect(valueOnAxisAt(points, 0, rate, year)).toBe(points[year]!.investedCents)
          expect(valueOnAxisAt(points, 0, rate, year, 'netWorth')).toBe(points[year]!.netWorthCents)
        }
        for (const years of [0.25, 7.5, 12.9, 14.99]) {
          expect(valueOnAxisAt(points, 0, rate, years)).toBe(planValueAt(line, years))
        }
      }
    }
  })

  it('reads the day before a step as the day before, for a line that starts a day after the origin', () => {
    // A day is about 0,0027 of a year: well outside the snap, so a snap widened to a day would fail here.
    const points = project(samplePlan())
    const day = yearsBetweenDays(1)
    const line = planLineOf(points)
    expect(valueOnAxisAt(points, day, I, 8)).toBe(Math.round(planValueAt(line, 8 - day)! / 1.02 ** day))
    expect(valueOnAxisAt(points, day, I, 8)).not.toBe(Math.round(points[8]!.investedCents / 1.02 ** day))
    expect(valueOnAxisAt(points, day, I, 8 + day)).toBe(Math.round(points[8]!.investedCents / 1.02 ** day))
  })

  it('reads the anniversary of a line that starts part way through a year as the anniversary, after its step', () => {
    // 0,1 + 4 - 0,1 is 3,9999999999999996 in floating point, which is the day before the step.
    const points = project(samplePlan())
    expect(0.1 + 4 - 0.1).not.toBe(4)
    for (const offset of [0.1, 0.2, 0.3, 0.7]) {
      for (let year = 0; year <= 30; year++) {
        expect(valueOnAxisAt(points, offset, I, offset + year)).toBe(Math.round(points[year]!.investedCents / 1.02 ** offset))
        expect(valueOnAxisAt(points, offset, I, offset + year, 'netWorth')).toBe(Math.round(points[year]!.netWorthCents / 1.02 ** offset))
      }
    }
  })

  it('has nothing before a scenario starts or after its last year', () => {
    const points = project(samplePlan({ horizonYears: 10 }))
    expect(valueOnAxisAt(points, 2, I, 1)).toBeNull()
    expect(valueOnAxisAt(points, 2, I, 1, 'netWorth')).toBeNull()
    expect(valueOnAxisAt(points, 2, I, 2)).toBe(Math.round(points[0]!.investedCents / 1.02 ** 2))
    expect(valueOnAxisAt(points, 2, I, 12)).toBe(Math.round(points[10]!.investedCents / 1.02 ** 2))
    expect(valueOnAxisAt(points, 2, I, 12.5)).toBeNull()
    expect(valueOnAxisAt(points, 2, I, 13, 'netWorth')).toBeNull()
  })

  it('gives the same euros on the account whichever start the axis counts from', () => {
    // Nominal: the axis value times the inflation since the origin is the scenario's own value times the
    // inflation since its own start, so where the origin sits never changes what the account shows.
    const points = project(samplePlan())
    for (const offset of [0, 0.75, 2, 3.4]) {
      for (const axisYear of [4, 9, 20]) {
        for (const field of ['invested', 'netWorth'] as const) {
          const onAxisValue = valueOnAxisAt(points, offset, I, axisYear, field)!
          const own = valueOnAxisAt(points, 0, I, axisYear - offset, field)!
          expect(onAxisValue * 1.02 ** axisYear).toBeCloseTo(own * 1.02 ** (axisYear - offset), -1)
        }
      }
    }
  })

  it('reads net worth between anniversaries on a straight line for the house and the loan', () => {
    const points = project(samplePlan())
    const at = (y: number) => valueOnAxisAt(points, 0, I, y, 'netWorth')!
    const invested = planValueAt(planLineOf(points), 12.5)!
    const house = (points[12]!.houseEquityCents + points[13]!.houseEquityCents) / 2
    const loan = (points[12]!.mortgageBalanceCents + points[13]!.mortgageBalanceCents) / 2
    expect(at(12.5)).toBe(Math.round(invested + house - loan))
  })

  it('holds no house in the year before it is bought: the purchase lands on the anniversary', () => {
    const points = project(samplePlan())
    const line = planLineOf(points)
    // The house is bought in year 8, so half way through year 7 the net worth is the invested line alone.
    expect(valueOnAxisAt(points, 0, I, 7.5, 'netWorth')).toBe(planValueAt(line, 7.5))
    expect(valueOnAxisAt(points, 0, I, 8, 'netWorth')).toBe(points[8]!.netWorthCents)
  })
})
