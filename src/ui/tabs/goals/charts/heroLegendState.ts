import { useMemo } from 'react'
import type { GoalScenario } from '../../../../types'
import type { ProjectionParams, PurchaseYearBreakdown } from '../../../../engine'
import { purchaseYearBreakdown } from '../../../../engine'
import type { ChartSeries } from '../../../charts/LinearChart'
import { pointSeriesValueAt } from './checkinChartUtils'
import type { ScenarioLegendBreakdown, ScenarioLegendItem } from './ScenarioSeriesLegend'
import { yearLabel } from '../yearLabel'

/** One line of the hero chart: a saved scenario, or the draft being edited. */
export interface ScenarioLine {
  id: string
  /** The saved scenario behind the line; null for the draft. */
  scenarioId: number | null
  name: string
  color: string
  dashed: boolean
  params: ProjectionParams
  /** Years from the axis' origin to the scenario's own start: 0 for one that starts on it. */
  offsetYears: number
  /** "Jul 2027", the month a scenario that starts after the origin starts in; null for one that starts on it. */
  startsIn: string | null
  /** The calendar year its last year ends in, where the axis is a calendar; null where every scenario starts on one day. */
  endsIn: string | null
  /** What its own figures are counted in ("2027 euros") where that is not the chart's money; null where it is. */
  ownMoney: string | null
}

/** A line as the legend reads it: a value at each of the axis' whole years, nothing where it has none. */
export interface LineReading {
  id: string
  color: string
  dashed?: boolean | undefined
  values: readonly (number | undefined)[]
  /** Its figure on the day it ends, in the same money, which a row past its end shows with the year. */
  last?: number | undefined
}

/** Everything the legend, the chips and the full-screen readout read the lines from. */
export interface LegendInput {
  lines: ScenarioLine[]
  readings: LineReading[]
  names: string[]
  years: number[]
  scenarios: GoalScenario[]
  hiddenIds: ReadonlySet<number> | undefined
  /** The axis' first day where it is a calendar (scenarios start on different days); null where it counts plan years. */
  calendarOrigin: string | null
}

export const NO_HIDDEN: ReadonlySet<number> = new Set()

/** A start more than about a month after the axis' origin is worth a tag that says when. */
const TAGGED_AFTER_YEARS = 1 / 12

/** What a year of the axis is called: "Year 8" in plan years, "2034" on a calendar. */
export function axisYearName(year: number, calendarOrigin: string | null): string {
  return calendarOrigin ? yearLabel(year, calendarOrigin) : `Year ${year}`
}

/** What a row says in place of a figure for a year before the line starts, or nothing to say a dash. */
export function rowStatus(line: ScenarioLine | undefined, year: number): string | null {
  return line && year < line.offsetYears && line.startsIn ? `starts ${line.startsIn}` : null
}

/**
 * For a year past a line's end, on a calendar: its last figure and the year it ended in, as the
 * comparison table gives it. Null where it has not ended, or every scenario starts on one day and a
 * line past its horizon shows a dash as it always has.
 */
export function endedReading(line: ScenarioLine | undefined, reading: LineReading, year: number): { valueCents: number; endedIn: string } | null {
  if (!line?.endsIn || year <= line.offsetYears || reading.last === undefined) return null
  return { valueCents: reading.last, endedIn: line.endsIn }
}

/** The tag beside a later scenario's name: when it starts, where that is not the axis' first day. */
function fromTag(line: ScenarioLine | undefined): { note: string } | Record<string, never> {
  return line?.startsIn && line.offsetYears > TAGGED_AFTER_YEARS ? { note: `from ${line.startsIn}` } : {}
}

/**
 * The purchase year of a line that is pointed at: the year itself for a line on the axis' places; for
 * one that starts part-way through a year, its purchase anniversary when that falls nearest the year
 * pointed at, since its own years never land on the axis' whole ones.
 */
function ownYearAt(line: ScenarioLine, year: number, ownYear: number | null | undefined): number | null {
  if (line.offsetYears === 0) return year
  return ownYear != null && Math.round(line.offsetYears + ownYear) === year ? ownYear : null
}

function breakdownAt(line: ScenarioLine, year: number): PurchaseYearBreakdown | null {
  const own = ownYearAt(line, year, line.params.housePurchaseYear)
  return own === null ? null : purchaseYearBreakdown(line.params, own)
}

/** One drawn line's row, read at `readIndex` (the year pointed at, or the resting one). */
function rowOf(s: LineReading, line: ScenarioLine | undefined, name: string | undefined, readIndex: number | null, readYear: number | null): ScenarioLegendItem {
  const scenarioId = line?.scenarioId ?? null
  // Gated on the year, not the index: a narrower window can leave a hovered index past the
  // end, and so can a scenario whose horizon is shorter than the chart's. Both read as
  // nothing rather than as zero.
  const value = readYear != null && readIndex != null ? s.values[readIndex] : undefined
  return {
    label: name ?? s.id,
    color: s.color,
    ...(s.dashed ? { dashed: true as const } : {}),
    ...(scenarioId !== null ? { scenarioId } : {}),
    ...fromTag(line),
    valueCents: value ?? null,
    ...(readYear != null && value === undefined ? missingRow(line, s, readYear) : {}),
  }
}

/** A row with no figure for the year it is read at: its last figure if it has ended, a dash, or what there is to say instead. */
function missingRow(line: ScenarioLine | undefined, reading: LineReading, year: number): { outOfRun: true; status?: string; valueCents?: number; endedIn?: string } {
  const ended = endedReading(line, reading, year)
  if (ended) return { outOfRun: true, ...ended }
  const status = rowStatus(line, year)
  return { outOfRun: true, ...(status ? { status } : {}) }
}

/**
 * What the legend beside a hero chart shows for a pointed-at year, and the breakdown under it. With
 * nothing pointed at, the rows read `restIndex` when given one, and nothing otherwise.
 */
export function useChartLegendState(input: LegendInput, activeIndex: number | null, restIndex: number | null = null) {
  const { lines, readings, names, years, scenarios, hiddenIds = NO_HIDDEN } = input
  const activeYear = activeIndex != null ? years[activeIndex] ?? null : null
  const readIndex = activeIndex ?? restIndex
  const readYear = readIndex != null ? years[readIndex] ?? null : null
  const legendItems: ScenarioLegendItem[] = useMemo(() => {
    const drawn = readings.map((s, idx) => rowOf(s, lines[idx], names[idx], readIndex, readYear))
    const drawnById = new Map(drawn.flatMap((d) => (d.scenarioId !== undefined ? [[d.scenarioId, d] as const] : [])))
    // In the scenarios' own order, a hidden one dimmed in its place so it can be brought
    // back from here, rather than dropping to the bottom and moving the rows under it. A
    // loaded, unchanged scenario is drawn as the draft and has no row of its own.
    const rows = scenarios.flatMap((s) => {
      if (hiddenIds.has(s.id)) return [{ label: s.name, color: s.color, scenarioId: s.id, hidden: true, valueCents: null }]
      const item = drawnById.get(s.id)
      return item ? [item] : []
    })
    return [...rows, ...drawn.filter((d) => d.scenarioId === undefined)]
  }, [readings, names, lines, readIndex, readYear, scenarios, hiddenIds])
  const breakdowns: ScenarioLegendBreakdown[] = useMemo(() => {
    if (activeYear == null) return []
    return lines.flatMap((line) => {
      const breakdown = breakdownAt(line, activeYear)
      if (!breakdown) return []
      return [
        {
          id: line.scenarioId === null ? 'draft' : String(line.scenarioId),
          label: line.name,
          color: line.color,
          ...(line.dashed ? { dashed: true as const } : {}),
          ...(line.ownMoney ? { money: line.ownMoney } : {}),
          breakdown,
        },
      ]
    })
  }, [activeYear, lines])
  const yearZeroHint = useMemo(() => {
    if (activeYear == null || breakdowns.length > 0) return false
    return lines.some((line) => line.params.housePurchaseYear === 0 && ownYearAt(line, activeYear, 0) === 0)
  }, [activeYear, breakdowns.length, lines])

  return { activeYear, readYear, legendItems, breakdowns, yearZeroHint }
}

/**
 * The legend's rows with the plan-from-today line listed last, after the draft: it belongs to the
 * plan but is not a scenario of its own.
 */
export function withFromToday(
  legendItems: ScenarioLegendItem[],
  fromTodayLine: ChartSeries | null,
  fromTodayLabel: string,
  activeYear: number | null,
): ScenarioLegendItem[] {
  if (!fromTodayLine) return legendItems
  const valueCents = activeYear != null ? pointSeriesValueAt(fromTodayLine.points ?? [], activeYear) : null
  // Before the check-in the line has not started; say so rather than leave the row blank.
  const outOfRun = activeYear != null && valueCents === null
  return [
    ...legendItems,
    { label: fromTodayLabel, color: fromTodayLine.color, dotted: true, valueCents, ...(outOfRun ? { outOfRun } : {}) },
  ]
}
