import type { GoalScenario } from '../../../../types'
import type { NewGoalScenario } from '../../../../data/dataSource'
import {
  lineValues,
  onAxis,
  projectNetWorth,
  projectNetWorthBand,
  scenarioAxis,
  scenarioToParams,
  valueOnAxisAt,
  type MoneyFormat,
  type YearPoint,
} from '../../../../engine'
import { planMoneyLabel } from '../planMoneyLabel'
import { yearLabel } from '../yearLabel'
import { sparseLabels } from '../../../charts/linearScale'
import type { ChartSeries } from '../../../charts/LinearChart'
import type { StartMark } from '../../../charts/ChartStartMarks'
import { scenarioInk } from '../scenarioInk'
import { NO_HIDDEN, type LineReading, type ScenarioLine } from './heroLegendState'

/**
 * Where the hero chart's axis starts, and where each scenario sits on it. The axis is a calendar that
 * starts on the earliest start among every scenario, hidden ones and the one being edited included, so
 * hiding a line never moves another. Where every scenario starts on one day all of them sit at 0 and
 * the chart reads in years of the plan, as it always has; otherwise it reads in calendar years.
 */
export interface HeroAxis {
  origin: string | null
  /** Scenarios start on different days, so the axis names calendar years. */
  calendar: boolean
  offsetOf: (start: string | null | undefined) => number
}

export function heroAxis(scenarios: readonly GoalScenario[], draft: Pick<NewGoalScenario, 'planStartDate'>): HeroAxis {
  const starts = [...scenarios.map((s) => s.planStartDate), draft.planStartDate]
  const { origin, offsets } = scenarioAxis(starts)
  const offsetOf = (start: string | null | undefined) => scenarioAxis([origin, start]).offsets[1] ?? 0
  return { origin, calendar: offsets.some((o) => o > 0), offsetOf }
}

const MONTH_YEAR = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })

/** "Jul 2027": the month a scenario starts in, in the app's English (the money's locale is for figures, not words). */
export function monthYear(date: string): string {
  return MONTH_YEAR.format(new Date(`${date}T00:00:00Z`))
}

/** The calendar year a scenario's last year ends in: its start's year (the axis' if it has none) and its horizon. */
function endYear(start: string | null | undefined, origin: string, horizonYears: number): string {
  return String(Number((start ?? origin).slice(0, 4)) + horizonYears)
}

interface LineSource {
  id: string
  scenarioId: number | null
  name: string
  color: string
  dashed: boolean
  scenario: NewGoalScenario
}

/** Each drawn scenario as a line: the saved ones not hidden, then the one being edited. */
export function scenarioLines(
  saved: GoalScenario[],
  draft: NewGoalScenario,
  activeId: number | null,
  dirty: boolean,
  inflationRate: number,
  axis: HeroAxis,
  format: MoneyFormat,
  hiddenIds: ReadonlySet<number> = NO_HIDDEN,
): ScenarioLine[] {
  const sources: LineSource[] = saved
    .filter((s) => (s.id !== activeId || dirty) && !hiddenIds.has(s.id))
    .map((s) => ({ id: `saved-${s.id}`, scenarioId: s.id, name: s.name, color: s.color, dashed: false, scenario: s }))
  sources.push({ id: 'draft', scenarioId: null, name: `${draft.name} (editing)`, color: draft.color, dashed: true, scenario: draft })
  return sources.map(({ scenario, color, ...line }) => {
    const offsetYears = axis.offsetOf(scenario.planStartDate)
    const start = scenario.planStartDate
    return {
      ...line,
      color: scenarioInk(color),
      params: scenarioToParams(scenario, inflationRate),
      offsetYears,
      startsIn: offsetYears > 0 && start ? monthYear(start) : null,
      endsIn: axis.calendar && axis.origin ? endYear(start, axis.origin, scenario.horizonYears) : null,
      ownMoney: offsetYears > 0 ? planMoneyLabel(start, format) : null,
    }
  })
}

/** How much the euros of a start `offsetYears` after the axis' origin are worth in the origin's. */
function deflator(offsetYears: number, inflationRate: number): number {
  return Math.pow(1 + inflationRate, offsetYears)
}

/**
 * A scenario that starts after the axis' origin, as a line placed at its own anniversaries, in the
 * origin's euros: `onAxis` gives each anniversary, after the value the day before where a step lands.
 */
function placedLine(points: readonly YearPoint[], offsetYears: number, inflationRate: number): Pick<ChartSeries, 'values' | 'preStep' | 'xs'> {
  const values: number[] = []
  const preStep: number[] = []
  const xs: number[] = []
  const placed = onAxis(points, offsetYears, inflationRate)
  placed.forEach((p, i) => {
    const next = placed[i + 1]
    if (next && next.xIndex === p.xIndex) return
    const prev = placed[i - 1]
    values.push(p.value)
    preStep.push(prev && prev.xIndex === p.xIndex ? prev.value : p.value)
    xs.push(p.xIndex)
  })
  return { values, preStep, xs }
}

/** A line's values as drawn: on the axis' places where it starts on the origin, at its own anniversaries otherwise. */
function lineOf(points: readonly YearPoint[], offsetYears: number, inflationRate: number): Pick<ChartSeries, 'values' | 'preStep' | 'xs'> {
  return offsetYears > 0 ? placedLine(points, offsetYears, inflationRate) : lineValues(points)
}

export interface HeroSeries {
  /** The axis' whole years, from the origin to the last year any line reaches. */
  years: number[]
  series: ChartSeries[]
  names: string[]
  /** Each line's own projection, which every figure read off it comes from. */
  points: YearPoint[][]
}

/**
 * `ends` (from `axisSpans`, on a calendar) carries the axis on to where every scenario ends, hidden ones
 * included, so the last year shown is the one the comparison table rests on and hiding a line does not
 * move it. A hidden line is still not drawn: the axis runs on with years nothing is drawn in.
 */
export function buildSeries(lines: ScenarioLine[], inflationRate: number, ends: readonly number[] = []): HeroSeries {
  const projected = lines.map((line) => ({ line, points: projectNetWorth(line.params) }))
  const reach = Math.max(0, ...ends, ...projected.map(({ line, points }) => line.offsetYears + (points[points.length - 1]?.year ?? 0)))
  // A sum a hair past a whole year is that year, and must not add one to the axis.
  const last = Math.ceil(reach - 1e-9)
  const years = Array.from({ length: last + 1 }, (_, i) => i)
  const series: ChartSeries[] = projected.map(({ line, points }) => ({
    id: line.id,
    color: line.color,
    // A line runs from its start to its own horizon and stops there. Filling the years after it with
    // zero drew the portfolio falling to nothing at the end of a shorter scenario.
    ...lineOf(points, line.offsetYears, inflationRate),
    dashed: line.dashed,
    ...(line.id === 'draft' ? { width: 2.5 } : {}),
  }))
  return { years, series, names: lines.map((l) => l.name), points: projected.map((p) => p.points) }
}

/**
 * The draft at a return three points either side, from where the draft starts: a sensitivity to the
 * return, not a range of likely outcomes.
 */
export function bandSeries(draft: NewGoalScenario, offsetYears: number, inflationRate: number): ChartSeries {
  const band = projectNetWorthBand(scenarioToParams(draft, inflationRate))
  const base = { id: 'uncertainty-band', color: scenarioInk(draft.color), values: [], kind: 'band' as const }
  if (offsetYears === 0) return { ...base, band }
  const back = (values: number[]) => values.map((v) => Math.round(v / deflator(offsetYears, inflationRate)))
  return {
    ...base,
    xs: band.lo.map((_, i) => offsetYears + i),
    band: { lo: back(band.lo), hi: back(band.hi), loPre: back(band.loPre), hiPre: back(band.hiPre) },
  }
}

/** Where each line buys a house, on the axis. */
export function purchaseMarkerIndices(lines: ScenarioLine[], years: number[]): { yearIndex: number }[] {
  const indices = new Set<number>()
  for (const line of lines) {
    const purchaseYear = line.params.housePurchaseYear
    if (purchaseYear == null) continue
    const place = line.offsetYears + purchaseYear
    if (line.offsetYears === 0) {
      const idx = years.indexOf(purchaseYear)
      if (idx >= 0) indices.add(idx)
    } else if (place <= (years[years.length - 1] ?? 0)) {
      indices.add(place)
    }
  }
  return [...indices].sort((a, b) => a - b).map((yearIndex) => ({ yearIndex }))
}

/**
 * What each line is worth at each of the axis' whole years, in the money the chart is drawn in: the
 * figure the legend, the chips, the tooltip and the full-screen readout all show. A line that starts
 * on the origin is read off its drawn values, which are its own figures; one that starts later is read
 * through `valueOnAxisAt`, nothing before its start and nothing after its end. `last` is its figure on
 * the day it ends, which a row past that day shows with the year. Nominal shows each year
 * in the euros on the account that year, so a figure is taken back up by the inflation from the origin.
 */
export function lineReadings(
  lines: ScenarioLine[],
  points: YearPoint[][],
  drawn: ChartSeries[],
  years: number[],
  inflationRate: number,
  nominalMode: boolean,
): LineReading[] {
  return drawn.map((s, idx) => {
    const line = lines[idx]
    const own = points[idx]
    if (!line || !own) return s
    const read = (year: number) => {
      const value = valueOnAxisAt(own, line.offsetYears, inflationRate, year)
      if (value === null) return undefined
      return nominalMode ? Math.round(value * deflator(year, inflationRate)) : value
    }
    const lastYear = own[own.length - 1]?.year ?? 0
    if (line.offsetYears === 0) return { ...s, last: s.values[lastYear] ?? read(lastYear) }
    return { id: s.id, color: s.color, dashed: s.dashed, values: years.map(read), last: read(line.offsetYears + lastYear) }
  })
}

/** Where each line that starts after the axis' origin begins, as drawn: its first point, and when. */
export function startMarksOf(lines: ScenarioLine[], drawn: ChartSeries[]): StartMark[] {
  return drawn.flatMap((s, i) => {
    const line = lines[i]
    const index = s.xs?.[0]
    const value = s.values[0]
    if (!line?.startsIn || index === undefined || value === undefined) return []
    return [{ index, value, color: s.color, label: `starts ${line.startsIn}` }]
  })
}

/**
 * The bottom axis' labels. Plan years read 0, 5, 10 as they always have. On a calendar a year takes four
 * digits, so a phone labels every tenth year, and the last year drawn is labelled only when it is far
 * enough past the last label (three fifths of a step) not to run into it.
 */
export function axisLabels(years: number[], calendarOrigin: string | null, narrow: boolean): string[] {
  if (!calendarOrigin) return sparseLabels(years, 5)
  const step = narrow ? 10 : 5
  const last = years.length - 1
  const lastLabelled = last - (last % step)
  return years.map((y, i) => {
    const labelled = i % step === 0 || (i === last && last - lastLabelled >= step * 0.6)
    return labelled ? yearLabel(y, calendarOrigin) : ''
  })
}
