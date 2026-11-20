import { describe, expect, it } from 'vitest'
import { lineValues, projectNetWorth, scenarioToParams, startLater, suggestedStart, valueOnAxisAt, yearsBetween } from '../../../../engine'
import { EU_MONEY_FORMAT } from '../../../../engine/money'
import { samplePlan, TEST_INFLATION_RATES } from '../../../../testing/samplePlan'
import type { GoalScenario } from '../../../../types'
import { clipToWindow } from './heroWindow'
import { inflateSeries } from './nominalTransform'
import { axisSpans, restYear } from './heroRestYear'
import { endedReading } from './heroLegendState'
import { place, restYear as tableRestYear } from './comparisonCalendar'
import { yearLabel } from '../yearLabel'
import { axisLabels, bandSeries, buildSeries, heroAxis, lineReadings, purchaseMarkerIndices, scenarioLines, startMarksOf } from './heroSeries'

const RATE = 0.02
const plan = samplePlan({ id: 1, name: 'Plan', planStartDate: '2026-01-01' })
/** A copy of the plan started on 1 July 2027 from its own line's figure, on its source's path. */
function laterCopy(source: GoalScenario, date: string, rate = RATE): GoalScenario {
  const start = suggestedStart(source, null, date, rate)!
  const copy = startLater(source, { date, investedCents: start.cents }, rate)!
  return { ...source, ...copy.patch, id: 2, name: 'Later', isActive: false, planStartDate: date }
}

function linesOf(saved: GoalScenario[], draft: GoalScenario, hidden: number[] = [], rate = RATE) {
  const axis = heroAxis(saved, draft)
  return { axis, lines: scenarioLines(saved, draft, draft.id, false, rate, axis, EU_MONEY_FORMAT, new Set(hidden)) }
}

describe('the hero axis', () => {
  it('counts plan years where every scenario starts on one day, and names nothing', () => {
    const { axis, lines } = linesOf([plan, { ...plan, id: 3 }], plan)
    expect(axis.calendar).toBe(false)
    expect(lines.every((l) => l.offsetYears === 0 && l.startsIn === null && l.endsIn === null && l.ownMoney === null)).toBe(true)
  })

  it('is a calendar from the earliest start, with each later scenario placed at its own', () => {
    const later = laterCopy(plan, '2027-07-01')
    const { axis, lines } = linesOf([plan, later], plan)
    expect(axis).toMatchObject({ origin: '2026-01-01', calendar: true })
    const line = lines.find((l) => l.scenarioId === 2)!
    expect(line.offsetYears).toBeCloseTo(1.5, 2)
    expect(line).toMatchObject({ startsIn: 'Jul 2027', endsIn: '2057', ownMoney: '2027 euros' })
    expect(lines.find((l) => l.id === 'draft')).toMatchObject({ offsetYears: 0, startsIn: null, endsIn: '2056' })
  })

  it('places a scenario with no start date on the origin', () => {
    const { lines } = linesOf([plan, { ...plan, id: 3, planStartDate: null }, laterCopy(plan, '2028-01-01')], plan)
    expect(lines.find((l) => l.scenarioId === 3)?.offsetYears).toBe(0)
  })
})

describe('a scenario that starts later, as drawn', () => {
  it('starts at its own date with its starting balance in the origin’s euros, and has nothing before it', () => {
    const later = { ...plan, id: 2, planStartDate: '2027-07-01', startInvestedCents: 18_000_000, housePurchaseYear: null }
    const { lines } = linesOf([plan, later], plan)
    const built = buildSeries(lines, RATE)
    const series = built.series[lines.findIndex((l) => l.scenarioId === 2)]!
    const offset = yearsBetween('2026-01-01', '2027-07-01')
    expect(series.xs?.[0]).toBe(offset)
    expect(series.values[0]).toBe(Math.round(18_000_000 / Math.pow(1 + RATE, offset)))
    expect(Math.min(...series.xs!)).toBe(offset)
    // The axis runs to the last whole year any line reaches: 1,5 + 30, rounded up.
    expect(built.years.at(-1)).toBe(32)
  })

  it('is drawn exactly as before when it starts on the origin', () => {
    const { lines } = linesOf([plan, { ...plan, id: 3, horizonYears: 20 }], plan)
    const built = buildSeries(lines, RATE)
    const own = lineValues(projectNetWorth(scenarioToParams(plan, RATE)))
    expect(built.series.at(-1)).toMatchObject(own)
    expect(built.series.every((s) => s.xs === undefined)).toBe(true)
    expect(built.years).toEqual(Array.from({ length: 31 }, (_, i) => i))
  })

  it('lies on its source’s line when it is a copy started on an anniversary of it', () => {
    for (const rate of TEST_INFLATION_RATES) {
      const copy = laterCopy(plan, '2029-01-01', rate)
      const { lines } = linesOf([plan, copy], plan, [], rate)
      const built = buildSeries(lines, rate)
      const at = lines.findIndex((l) => l.scenarioId === 2)
      const source = projectNetWorth(scenarioToParams(plan, rate))
      const series = built.series[at]!
      series.xs!.forEach((x, k) => {
        const own = valueOnAxisAt(source, 0, rate, x)
        if (own === null) return
        expect(Math.abs(series.values[k]! - own)).toBeLessThanOrEqual(70)
      })
    }
  })

  it('never reads above its source when it is a copy started part-way through a year', () => {
    const quiet = samplePlan({ id: 1, planStartDate: '2026-01-01', housePurchaseYear: null, lifeEvents: [] })
    const copy = laterCopy(quiet, '2027-07-01')
    const { lines } = linesOf([quiet, copy], quiet)
    const built = buildSeries(lines, RATE)
    const source = projectNetWorth(scenarioToParams(quiet, RATE))
    const readings = lineReadings(lines, built.points, built.series, built.years, RATE, false)
    const later = readings[lines.findIndex((l) => l.scenarioId === 2)]!
    built.years.forEach((year) => {
      const value = later.values[year]
      const own = valueOnAxisAt(source, 0, RATE, year)
      if (value === undefined || own === null) return
      expect(value).toBeLessThanOrEqual(own + 1)
    })
  })

  it('does not move when the earliest scenario is hidden', () => {
    const later = laterCopy(plan, '2027-07-01')
    const other = { ...plan, id: 3, name: 'Other' }
    const shown = linesOf([other, later], plan)
    const hidden = linesOf([other, later], plan, [3])
    const pick = (l: typeof shown) => buildSeries(l.lines, RATE).series[l.lines.findIndex((x) => x.scenarioId === 2)]
    expect(pick(hidden)).toEqual(pick(shown))
  })

  it('reads at each whole year of the axis through the engine, in either view', () => {
    const later = laterCopy(plan, '2027-07-01')
    const { lines } = linesOf([plan, later], plan)
    const built = buildSeries(lines, RATE)
    const at = lines.findIndex((l) => l.scenarioId === 2)
    const offset = lines[at]!.offsetYears
    const real = lineReadings(lines, built.points, built.series, built.years, RATE, false)[at]!
    const nominal = lineReadings(lines, built.points, inflateSeries(built.series, built.years, RATE), built.years, RATE, true)[at]!
    expect(real.values[1]).toBeUndefined()
    expect(real.values[32]).toBeUndefined()
    for (const year of [2, 15, 31]) {
      const engine = valueOnAxisAt(built.points[at]!, offset, RATE, year)!
      expect(real.values[year]).toBe(engine)
      expect(nominal.values[year]).toBe(Math.round(engine * Math.pow(1 + RATE, year)))
    }
    // A line on the origin is read off what is drawn, as it always was.
    const first = lines.findIndex((l) => l.scenarioId === 1)
    expect(lineReadings(lines, built.points, built.series, built.years, RATE, false)[first]).toBe(built.series[first])
  })

  it('marks its purchase at its own place on the axis', () => {
    const later = { ...plan, id: 2, planStartDate: '2027-07-01' }
    const { lines } = linesOf([plan, later], plan)
    const marks = purchaseMarkerIndices(lines, buildSeries(lines, RATE).years).map((m) => m.yearIndex)
    expect(marks).toContain(8)
    expect(marks.some((m) => Math.abs(m - (lines.find((l) => l.scenarioId === 2)!.offsetYears + 8)) < 1e-9)).toBe(true)
  })

  it('carries its band from its own start, in the origin’s euros', () => {
    const offset = 1.5
    const band = bandSeries(plan, offset, RATE)
    const atOrigin = bandSeries(plan, 0, RATE)
    expect(atOrigin.xs).toBeUndefined()
    expect(band.xs?.slice(0, 2)).toEqual([1.5, 2.5])
    expect(band.band?.lo[3]).toBe(Math.round(atOrigin.band!.lo[3]! / Math.pow(1 + RATE, offset)))
  })

  it('is marked where it starts, and the marks follow what is drawn', () => {
    const later = laterCopy(plan, '2027-07-01')
    const { lines } = linesOf([plan, later], plan)
    const built = buildSeries(lines, RATE)
    const marks = startMarksOf(lines, built.series)
    expect(marks).toHaveLength(1)
    expect(marks[0]).toMatchObject({ label: 'starts Jul 2027', value: built.series[lines.findIndex((l) => l.scenarioId === 2)]!.values[0] })
    // Cut at a window that ends before it starts, it is not drawn and has no mark.
    expect(startMarksOf(lines, clipToWindow(built.years, built.series, 1).series)).toHaveLength(0)
  })
})

describe('a scenario that ends before another starts', () => {
  // A from 2026 for 5 years, B from 2032 for 10: no year has both, so everything rests on the last year shown.
  const a = { ...plan, horizonYears: 5 }
  const b = { ...plan, id: 2, name: 'B', planStartDate: '2032-01-01', horizonYears: 10 }

  it.each(TEST_INFLATION_RATES)('rests on 2042, where A reads its last figure (ended 2031) and B its own (inflation %s)', (rate) => {
    const { axis, lines } = linesOf([a, b], a, [], rate)
    const built = buildSeries(lines, rate)
    const readings = lineReadings(lines, built.points, built.series, built.years, rate, false)
    const rest = restYear(axisSpans(lines, [a, b], axis.origin!), built.years.length - 1)
    expect(rest).toEqual({ index: 16, everyReaches: false })
    const at = (id: number | null) => lines.findIndex((l) => l.scenarioId === id)
    const draft = at(null)
    expect(readings[draft]!.values[16]).toBeUndefined()
    expect(endedReading(lines[draft], readings[draft]!, 16)).toEqual({ valueCents: built.points[draft]!.at(-1)!.investedCents, endedIn: '2031' })
    const later = at(2)
    expect(lines[later]!.offsetYears).toBe(6)
    expect(readings[later]!.values[16]).toBe(valueOnAxisAt(built.points[later]!, 6, rate, 16))
    expect(readings[later]!.last).toBe(readings[later]!.values[16])
  })

  it.each(TEST_INFLATION_RATES)('rests where the comparison table does, 2042, with B shown or hidden (inflation %s)', (rate) => {
    const table = tableRestYear([place(a, '2026-01-01', rate), place(b, '2026-01-01', rate)])
    expect(table).toEqual({ year: 16, everyReaches: false })
    for (const hidden of [[], [b.id]]) {
      const { axis, lines } = linesOf([a, b], a, hidden, rate)
      const spans = axisSpans(lines, [a, b], axis.origin!)
      const built = buildSeries(lines, rate, spans.ends)
      const chart = restYear(spans, built.years.length - 1)
      expect({ year: chart.index, everyReaches: chart.everyReaches }).toEqual(table)
      expect(yearLabel(chart.index, axis.origin)).toBe('2042')
    }
  })
})

describe('the axis a later line ends on', () => {
  it('gets no extra year from a sum a hair past a whole one', () => {
    const { lines } = linesOf([plan], plan)
    const built = buildSeries([{ ...lines[0]!, offsetYears: 1 + 1e-12 }], RATE)
    expect(built.years.at(-1)).toBe(31)
  })
})

describe('a window cuts a later line at its edge', () => {
  it('carries the line and its band to the edge along the year it is cut in', () => {
    const series = {
      id: 'later',
      color: '#000',
      values: [100, 200, 300],
      preStep: [100, 260, 300],
      xs: [1.5, 2.5, 3.5],
      band: { lo: [100, 180, 280], hi: [100, 220, 320], loPre: [100, 240, 280], hiPre: [100, 280, 320] },
    }
    const [cut] = clipToWindow([0, 1, 2, 3, 4], [series], 3).series
    expect(cut?.xs).toEqual([1.5, 2.5, 3])
    // Halfway from 200 towards the 300 the next anniversary reached, with no step at the edge.
    expect(cut?.values).toEqual([100, 200, 250])
    expect(cut?.preStep).toEqual([100, 260, 250])
    expect(cut?.band?.lo).toEqual([100, 180, 230])
    expect(cut?.band?.loPre).toEqual([100, 240, 230])
    // One that ends on the edge, or inside the window, is left whole.
    expect(clipToWindow([0, 1, 2, 3, 4], [series], 4).series[0]).toEqual(series)
    expect(clipToWindow([0, 1, 2], [series], 2.5).series[0]?.xs).toEqual([1.5, 2.5])
  })
})

describe('a later line in the Nominal view', () => {
  it('is taken up by the inflation over the year each value sits at', () => {
    const [up] = inflateSeries([{ id: 'l', color: '#000', values: [100_000, 200_000], xs: [1.5, 2.5] }], [0, 1, 2, 3], 0.02)
    expect(up?.values).toEqual([Math.round(100_000 * 1.02 ** 1.5), Math.round(200_000 * 1.02 ** 2.5)])
  })
})

describe('the bottom axis', () => {
  const years = Array.from({ length: 34 }, (_, i) => i)
  it('reads plan years as it always has', () => {
    expect(axisLabels(years, null, true).filter(Boolean)).toEqual(['0', '5', '10', '15', '20', '25', '30', '33'])
  })

  it('reads calendar years, every fifth on a wide screen and every tenth on a phone', () => {
    expect(axisLabels(years, '2026-03-01', false).filter(Boolean)).toEqual(['2026', '2031', '2036', '2041', '2046', '2051', '2056', '2059'])
    // 2059 is three years past 2056 of a ten-year step, so close enough to run into it.
    expect(axisLabels(years, '2026-03-01', true).filter(Boolean)).toEqual(['2026', '2036', '2046', '2056'])
    expect(axisLabels(years.slice(0, 33), '2026-03-01', false).filter(Boolean).at(-1)).toBe('2056')
  })
})
