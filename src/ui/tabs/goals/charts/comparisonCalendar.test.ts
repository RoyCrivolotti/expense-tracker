import { describe, expect, it } from 'vitest'
import {
  EU_MONEY_FORMAT,
  planFromToday,
  projectNetWorth,
  scenarioToParams,
  startLater,
  suggestedStart,
  valueOnAxisAt,
  yearsBetween,
} from '../../../../engine'
import type { GoalScenario } from '../../../../types'
import { makeScenario } from '../../../../testing/factories'
import { samplePlan, SAMPLE_INFLATION } from '../../../../testing/samplePlan'
import { scenarioToDraft } from '../scenarioDraft'
import { comparisonOrigin, restYear, type Placed } from './comparisonCalendar'
import { comparisonRows } from './comparisonRows'

const I = SAMPLE_INFLATION

/** 100.000 € that neither grows nor gets added to: it is worth the same in every year of its own euros. */
function flat(overrides: Partial<GoalScenario>): GoalScenario {
  return makeScenario({ startInvestedCents: 100_000_00, monthlyContributionCents: 0, expectedRealReturn: 0, housePurchaseYear: null, horizonYears: 30, ...overrides })
}

/** A copy of the sample plan started on `date` from its own line, as "Start a copy later" will make it. */
function laterCopy(source: GoalScenario, date: string): GoalScenario {
  const suggested = suggestedStart(source, null, date, I)!
  return { ...source, id: 2, name: 'Later copy', isActive: false, ...startLater(source, { date, investedCents: suggested.cents }, I)!.patch }
}

describe('comparisonOrigin', () => {
  it('is null while every scenario starts on one day, which keeps the table reading each at its own plan year', () => {
    expect(comparisonOrigin([flat({ planStartDate: '2026-01-01' }), flat({ planStartDate: null })], flat({ planStartDate: '2026-01-01' }))).toBeNull()
  })

  it('is the earliest start once one differs, the draft included', () => {
    expect(comparisonOrigin([flat({ planStartDate: '2026-01-01' })], flat({ planStartDate: '2027-07-01' }))).toBe('2026-01-01')
    expect(comparisonOrigin([flat({ planStartDate: '2027-07-01' })], flat({ planStartDate: '2026-01-01' }))).toBe('2026-01-01')
  })
})

describe('restYear', () => {
  const at = (offset: number, end: number) => ({ offset, end }) as Placed

  it('keeps the year a row ends on when its end is a scrap of rounding under it', () => {
    expect(restYear([at(0, 30), at(1.5, 31.5)])).toEqual({ year: 30, everyReaches: true })
    expect(restYear([at(0.1, 0.1 + 29.9 - 1e-12), at(0, 40)])).toEqual({ year: 30, everyReaches: true })
  })

  it('rests on the last year shown when one path ends before another starts, as the chart does', () => {
    expect(restYear([at(0, 5), at(6, 16)])).toEqual({ year: 16, everyReaches: false })
    // A start part-way through a year must not add one to the last year shown.
    expect(restYear([at(0, 5), at(6 + 1e-12, 6 + 1e-12 + 10)])).toEqual({ year: 16, everyReaches: false })
    expect(restYear([at(0, 5), at(5.5, 15.5)])).toEqual({ year: 16, everyReaches: false })
  })

  it('counts a start on the earliest end, or in the year before it, as sharing that year', () => {
    expect(restYear([at(0, 5), at(5, 15)])).toEqual({ year: 5, everyReaches: true })
    expect(restYear([at(0, 5), at(4.5, 14.5)])).toEqual({ year: 5, everyReaches: true })
    expect(restYear([at(0, 5), at(5 + 1e-12, 15)])).toEqual({ year: 5, everyReaches: true })
  })
})

describe('comparisonRows on one calendar', () => {
  const early = flat({ id: 1, name: 'Early', planStartDate: '2026-01-01' })
  const later = flat({ id: 2, name: 'Later', planStartDate: '2027-07-01' })

  it('reads a path that starts 18 months later on the same date, in the euros of the earliest start', () => {
    const rows = comparisonRows([early, later], scenarioToDraft(early), EU_MONEY_FORMAT, I, false, 5)
    // Both hold 100.000 € in the euros of their own start. On 1 January 2031 the early one has 100.000 € in
    // 2026 euros. The later one's euros are those of 1 July 2027, 1 + 181/365 years on, so its 100.000 € are
    // 100.000 / 1,02^1,49589 = 97.081,19 € in 2026 euros. Read each at its own year 5, the table used to show
    // 100.000 € for both, one on 1 January 2031 and the other on 1 July 2032.
    expect(rows.map((r) => r.investedCents)).toEqual([100_000_00, 97_081_19])
    expect(rows.map((r) => r.netWorthCents)).toEqual([100_000_00, 97_081_19])
    expect(rows.map((r) => r.atYear)).toEqual([5, 5])
  })

  it('says when a path starts instead of a figure for a date before it', () => {
    const rows = comparisonRows([early, later], scenarioToDraft(early), EU_MONEY_FORMAT, I, false, 1)
    expect(rows[1]).toMatchObject({ invested: 'starts Jul 2027', netWorth: 'starts Jul 2027', investedCents: null, ended: false })
  })

  it('gives a path that has ended its last figure and the year it ended', () => {
    const short = flat({ id: 3, name: 'Short', planStartDate: '2027-07-01', horizonYears: 8 })
    const rows = comparisonRows([early, short], scenarioToDraft(early), EU_MONEY_FORMAT, I, false, 20)
    expect(rows[1]).toMatchObject({ invested: '97k € (ended 2035)', investedCents: 97_081_19, ended: true })
    expect(rows[0]!.ended).toBe(false)
  })

  it('reads every row at the last year every scenario reaches when no window is chosen', () => {
    const rows = comparisonRows([early, later], scenarioToDraft(early), EU_MONEY_FORMAT, I, false)
    // The early path ends in 2056 and the later one in 2057: both are read on 1 January 2056.
    expect(rows.map((r) => r.atYear)).toEqual([30, 30])
    expect(rows.map((r) => r.ended)).toEqual([false, false])
    expect(rows.map((r) => r.everyReaches)).toEqual([true, true])
  })

  describe('when one path ends before another starts', () => {
    // Growing, adding every month and buying a house, so every figure moves with the year it is read in.
    const a = makeScenario({ id: 1, name: 'A', planStartDate: '2026-01-01', horizonYears: 5, housePurchaseYear: 2 })
    const b = makeScenario({ id: 2, name: 'B', planStartDate: '2032-01-01', horizonYears: 10, housePurchaseYear: 3 })
    const fields = ['invested', 'netWorth'] as const
    const cents = { invested: 'investedCents', netWorth: 'netWorthCents' } as const

    for (const inflation of [I, 0, -0.01]) {
      it(`rests on 2042, the last year shown, with A's last figure and B's own, at ${inflation} inflation`, () => {
        const rows = comparisonRows([a, b], scenarioToDraft(a), EU_MONEY_FORMAT, inflation, false)
        expect(rows.map((r) => [r.atYear, r.everyReaches])).toEqual([[16, false], [16, false]])
        const ownA = projectNetWorth(scenarioToParams(a, inflation))
        const ownB = projectNetWorth(scenarioToParams(b, inflation))
        for (const field of fields) {
          expect(rows[0]![cents[field]]).toBe(valueOnAxisAt(ownA, 0, inflation, 5, field))
          expect(rows[0]![field]).toMatch(/ \(ended 2031\)$/)
          expect(rows[1]![cents[field]]).toBe(valueOnAxisAt(ownB, 6, inflation, 16, field))
          expect(rows[1]![cents[field]]).not.toBeNull()
          expect(rows[1]![field]).not.toMatch(/ended|starts/)
        }
        expect(rows.map((r) => r.ended)).toEqual([true, false])
      })
    }

    it('rests on the earliest end when the later path starts on it, with a figure for both', () => {
      const onEnd = { ...b, planStartDate: '2031-01-01' }
      const rows = comparisonRows([a, onEnd], scenarioToDraft(a), EU_MONEY_FORMAT, I, false)
      expect(rows.map((r) => [r.atYear, r.everyReaches, r.ended])).toEqual([[5, true, false], [5, true, false]])
      const own = projectNetWorth(scenarioToParams(onEnd, I))
      for (const field of fields) expect(rows[1]![cents[field]]).toBe(valueOnAxisAt(own, 5, I, 5, field))
    })

    it('reads a start part-way through a year on the last year shown, where both paths have ended', () => {
      const midYear = { ...b, planStartDate: '2031-07-01' }
      const rows = comparisonRows([a, midYear], scenarioToDraft(a), EU_MONEY_FORMAT, I, false)
      // B ends on 1 July 2041; the axis runs to 1 January 2042, the last year shown.
      expect(rows.map((r) => [r.atYear, r.everyReaches])).toEqual([[16, false], [16, false]])
      expect(rows.map((r) => r.invested.replace(/^.* /, ''))).toEqual(['2031)', '2041)'])
      const offset = yearsBetween('2026-01-01', '2031-07-01')
      expect(rows[1]!.investedCents).toBe(valueOnAxisAt(projectNetWorth(scenarioToParams(midYear, I)), offset, I, offset + 10, 'invested'))
      expect(rows[1]!.investedCents).not.toBeNull()
    })

    it('rests on the earliest end when the later path starts part-way through the year before it', () => {
      const before = { ...b, planStartDate: '2030-07-01' }
      const rows = comparisonRows([a, before], scenarioToDraft(a), EU_MONEY_FORMAT, I, false)
      expect(rows.map((r) => [r.atYear, r.everyReaches, r.ended])).toEqual([[5, true, false], [5, true, false]])
    })

    it('keeps reading a chosen window, not the last year shown', () => {
      const rows = comparisonRows([a, b], scenarioToDraft(a), EU_MONEY_FORMAT, I, false, 5)
      expect(rows.map((r) => r.atYear)).toEqual([5, 5])
      expect(rows[1]!.invested).toBe('starts Jan 2032')
    })
  })

  it('gives FI and the house purchase as the month they fall in', () => {
    const buys = flat({ id: 3, name: 'Buys', planStartDate: '2027-07-01', housePurchaseYear: 4, housePriceCents: 10_000_00 })
    const owns = flat({ id: 4, name: 'Owns', planStartDate: '2027-07-01', housePurchaseYear: 0, housePriceCents: 10_000_00 })
    const fi = flat({ id: 5, name: 'FI', planStartDate: '2027-07-01', annualSpendCents: 3_000_00, monthlyContributionCents: 500_00 })
    const rows = comparisonRows([early, buys, owns, fi], scenarioToDraft(early), EU_MONEY_FORMAT, I, false)
    expect(rows.map((r) => r.house)).toEqual(['never', 'Jul 2031', 'owned', 'never'])
    // 100.000 € pays 4.000 € a year at 4%, over the 3.000 € to live on from the first day: FI is the month it starts.
    expect(rows[3]!.fi).toBe('Jul 2027')
    expect(rows[0]!.fi).toBe('Jan 2026')
    const slow = flat({ id: 6, name: 'Slow', planStartDate: '2027-07-01', annualSpendCents: 5_000_00, monthlyContributionCents: 500_00 })
    expect(comparisonRows([early, slow], scenarioToDraft(early), EU_MONEY_FORMAT, I, false)[1]!.fi).toMatch(/^[A-Z][a-z]{2} 20\d\d$/)
    const never = flat({ id: 7, name: 'Never', planStartDate: '2027-07-01', annualSpendCents: 900_000_00 })
    expect(comparisonRows([early, never], scenarioToDraft(early), EU_MONEY_FORMAT, I, false)[1]!.fi).toBe('not in horizon')
  })

  it('puts a scenario with no start date at the earliest start, where the chart draws it', () => {
    const undated = flat({ id: 3, name: 'Undated', planStartDate: null })
    const rows = comparisonRows([early, later, undated], scenarioToDraft(early), EU_MONEY_FORMAT, I, false, 5)
    expect(rows[2]!.investedCents).toBe(rows[0]!.investedCents)
  })
})

describe('the table agrees with the chart for a path started later', () => {
  const source = samplePlan({ id: 1 })
  const copy = laterCopy(source, '2027-07-01')
  const offset = yearsBetween('2026-01-01', '2027-07-01')

  for (const window of [5, 10, 20, null]) {
    it(`gives the figure the shared calendar gives, to the cent, at ${window ?? 'the last shared'} year`, () => {
      const rows = comparisonRows([source, copy], scenarioToDraft(source), EU_MONEY_FORMAT, I, false, window)
      const at = rows[1]!.atYear
      const points = projectNetWorth(scenarioToParams(copy, I))
      expect(rows[1]!.investedCents).toBe(valueOnAxisAt(points, offset, I, at, 'invested'))
      expect(rows[1]!.netWorthCents).toBe(valueOnAxisAt(points, offset, I, at, 'netWorth'))
      const own = projectNetWorth(scenarioToParams(source, I))
      expect(rows[0]!.investedCents).toBe(own[at]!.investedCents)
      expect(rows[0]!.netWorthCents).toBe(own[at]!.netWorthCents)
    })
  }

  it('reads the plan from today on the same calendar, from the day of its check-in', () => {
    const later = { ...copy, id: 3 }
    const fromToday = planFromToday(source, { investedCents: 9_000_000, date: '2027-03-05' }, I)!
    const rows = comparisonRows([source, later], scenarioToDraft(source), EU_MONEY_FORMAT, I, false, 10, fromToday)
    expect(rows.map((r) => r.key)).toEqual(['saved-1', 'from-today', 'saved-3'])
    const points = projectNetWorth(scenarioToParams(fromToday.scenario, I))
    expect(rows[1]!.investedCents).toBe(valueOnAxisAt(points, yearsBetween('2026-01-01', '2027-03-05'), I, 10))
    expect(rows[1]!.fi).toMatch(/^[A-Z][a-z]{2} 20\d\d$/)
  })
})
