import { useMemo } from 'react'
import type { GoalScenario } from '../../../../types'
import type { YearPoint } from '../../../../engine'
import type { ChartSeries } from '../../../charts/LinearChart'
import { useChartLegendState, withFromToday, type LegendInput, type ScenarioLine } from './heroLegendState'
import { usePublishHeroLegend, type HeroLegendStore } from './heroLegendStore'
import { lineReadings } from './heroSeries'
import { axisSpans, restNote, restYear } from './heroRestYear'
import { useHeroTooltip } from './heroTooltip'

interface Input {
  lines: ScenarioLine[]
  points: YearPoint[][]
  /** The lines as drawn, cut at the window and in the view's money. */
  displaySeries: ChartSeries[]
  names: string[]
  years: number[]
  inflationRate: number
  nominalMode: boolean
  scenarios: GoalScenario[]
  hiddenIds: ReadonlySet<number> | undefined
  /** The axis' first day where it is a calendar; null where every scenario starts on one day. */
  calendarOrigin: string | null
  activeIndex: number | null
  legendStore: HeroLegendStore | undefined
  fromTodayLine: ChartSeries | null
  fromTodayLabel: string
}

/**
 * Every figure the hero chart states, read in one place: the legend's rows, the chips above the chart,
 * the tooltip and what the full-screen readout is handed. On a calendar the resting year (with nothing
 * pointed at) is the last year every scenario reaches, hidden ones included; where every scenario starts on one day the chips rest
 * on the last year drawn and the rows show nothing, as they always have.
 */
export function useHeroReadings(input: Input) {
  const { lines, points, displaySeries, names, years, inflationRate, nominalMode, scenarios, hiddenIds, calendarOrigin } = input
  const readings = useMemo(
    () => lineReadings(lines, points, displaySeries, years, inflationRate, nominalMode),
    [lines, points, displaySeries, years, inflationRate, nominalMode],
  )
  const rest = useMemo(
    () => (calendarOrigin ? restYear(axisSpans(lines, scenarios, calendarOrigin), years.length - 1) : null),
    [calendarOrigin, lines, scenarios, years],
  )
  const calendar = useMemo(() => (calendarOrigin && rest ? { origin: calendarOrigin, rest } : null), [calendarOrigin, rest])
  const legendInput: LegendInput = useMemo(
    () => ({ lines, readings, names, years, scenarios, hiddenIds, calendarOrigin }),
    [lines, readings, names, years, scenarios, hiddenIds, calendarOrigin],
  )
  // The rows under the chart show the resting year's figures where the chips above do not.
  const legendRest = input.legendStore === undefined ? (rest?.index ?? null) : null
  const legend = useChartLegendState(legendInput, input.activeIndex, legendRest)
  usePublishHeroLegend(input.legendStore, legendInput, input.activeIndex, rest?.index ?? years.length - 1)
  const tooltip = useHeroTooltip(legendInput, input.fromTodayLine, input.fromTodayLabel)
  const { legendItems, readYear } = legend
  const legendWithFromToday = useMemo(
    () => withFromToday(legendItems, input.fromTodayLine, input.fromTodayLabel, readYear),
    [legendItems, input.fromTodayLine, input.fromTodayLabel, readYear],
  )
  const sheetReading = useMemo(
    () => ({ ...legendInput, restIndex: rest?.index ?? null, restNote: calendar ? restNote(calendar.rest, calendar.origin) : undefined }),
    [legendInput, rest, calendar],
  )
  return { ...legend, legendWithFromToday, tooltip, calendar, sheetReading }
}
