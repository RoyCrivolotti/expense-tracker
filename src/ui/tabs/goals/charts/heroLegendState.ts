import { useMemo } from 'react'
import type { GoalScenario } from '../../../../types'
import type { ProjectionParams } from '../../../../engine'
import { purchaseYearBreakdown } from '../../../../engine'
import type { ChartSeries } from '../../../charts/LinearChart'
import { pointSeriesValueAt } from './checkinChartUtils'
import type { ScenarioLegendBreakdown, ScenarioLegendItem } from './ScenarioSeriesLegend'

/** One line of the hero chart: a saved scenario, or the draft being edited. */
export interface ScenarioLine {
  id: string
  /** The saved scenario behind the line; null for the draft. */
  scenarioId: number | null
  name: string
  color: string
  dashed: boolean
  params: ProjectionParams
}

export const NO_HIDDEN: ReadonlySet<number> = new Set()

/** What the legend beside a hero chart shows for a pointed-at year, and the breakdown under it. */
export function useChartLegendState(
  lines: ScenarioLine[],
  series: ChartSeries[],
  names: string[],
  years: number[],
  activeIndex: number | null,
  scenarios: GoalScenario[],
  hiddenIds: ReadonlySet<number> = NO_HIDDEN,
) {
  const activeYear = activeIndex != null ? years[activeIndex] ?? null : null
  const legendItems: ScenarioLegendItem[] = useMemo(() => {
    const drawn = series.map((s, idx) => {
      const scenarioId = lines[idx]?.scenarioId ?? null
      // Gated on the year, not the index: a narrower window can leave a hovered index past the
      // end, and so can a scenario whose horizon is shorter than the chart's. Both read as
      // nothing rather than as zero.
      const value = activeYear != null && activeIndex != null ? s.values[activeIndex] : undefined
      return {
        label: names[idx] ?? s.id,
        color: s.color,
        ...(s.dashed ? { dashed: true as const } : {}),
        ...(scenarioId !== null ? { scenarioId } : {}),
        valueCents: value ?? null,
        ...(activeYear != null && value === undefined ? { outOfRun: true as const } : {}),
      }
    })
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
  }, [series, names, lines, activeIndex, activeYear, scenarios, hiddenIds])
  const breakdowns: ScenarioLegendBreakdown[] = useMemo(() => {
    if (activeYear == null) return []
    return lines.flatMap((line) => {
      const breakdown = purchaseYearBreakdown(line.params, activeYear)
      if (!breakdown) return []
      return [
        {
          id: line.scenarioId === null ? 'draft' : String(line.scenarioId),
          label: line.name,
          color: line.color,
          ...(line.dashed ? { dashed: true as const } : {}),
          breakdown,
        },
      ]
    })
  }, [activeYear, lines])
  const yearZeroHint = useMemo(() => {
    if (activeYear !== 0 || breakdowns.length > 0) return false
    return lines.some((line) => line.params.housePurchaseYear === 0)
  }, [activeYear, breakdowns.length, lines])

  return { activeYear, legendItems, breakdowns, yearZeroHint }
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
