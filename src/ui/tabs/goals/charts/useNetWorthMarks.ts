import { useCallback, useMemo } from 'react'
import type { LegendItem } from '../../../charts/ChartLegend'
import { formatMoneyShort } from '../chartTheme'
import type { useHeroReadings } from './heroReadings'
import { startMarksOf } from './heroMarks'
import { fiMarker, projectionLabel, todayProp } from './netWorthChartProps'
import type { ChartEnv } from './netWorthChartTypes'
import { useFiTarget, useValueTags, type useLifeEventMarkers } from './netWorthSeriesHooks'
import { useMilestonePick } from './useMilestonePick'
import type { Drawn, Placed } from './useNetWorthLines'

/** The milestone and FI lines, the start marks, and the series and formats the chart is handed. */
export function useChartMarks(
  env: ChartEnv,
  placed: Placed,
  drawn: Drawn,
) {
  const { isHero, milestones, nominalMode, projectionRate, scenarios, draft, format, legendStore, narrow } = env
  const { lines, draftOffset, axis, full } = placed
  const { drawnMax, years, displaySeries, displayBand, displayRealPoints, displayExtraSeries, series } = drawn
  const pick = useMilestonePick({
    isHero,
    milestones,
    drawnMax,
    fiTargetCents: useFiTarget(isHero, draft, draftOffset, projectionRate),
    nominalMode,
    years,
    inflationRate: projectionRate,
    lines,
    scenarios,
    draft,
    origin: axis.origin,
  })
  const { fiAbove } = pick
  const fiChartMarker = useMemo(() => fiMarker(fiAbove, format), [fiAbove, format])
  const startMarks = useMemo(() => startMarksOf(lines, displaySeries), [lines, displaySeries])
  // Stable between renders, so a year pointed at, which re-renders this, does not make the chart
  // work out its axis and paths again from arrays that only look new.
  const chartSeries = useMemo(
    () => [...(displayBand ? [displayBand] : []), ...displaySeries, ...displayRealPoints, ...displayExtraSeries],
    [displayBand, displaySeries, displayRealPoints, displayExtraSeries],
  )
  const formatValue = useCallback((cents: number) => formatMoneyShort(cents, format), [format])
  const valueTags = useValueTags(legendStore !== undefined && isHero && !narrow, draft.expectedRealReturn, format)
  const names = full.names
  const staticLegend: LegendItem[] = useMemo(
    () => series.map((s, idx) => ({ label: names[idx] ?? s.id, color: s.color })),
    [series, names],
  )
  return { pick, fiChartMarker, startMarks, chartSeries, formatValue, valueTags, staticLegend }
}

export type Marks = ReturnType<typeof useChartMarks>

/**
 * What the full-screen chart draws from, held between renders so a year pointed at in the card,
 * which re-renders this, does not hand it new objects to work from.
 */
export function useSheetChart(
  marks: Marks,
  drawn: Drawn,
  extra: {
    lifeEventMarkers: ReturnType<typeof useLifeEventMarkers>
    todayIndex: number | undefined
    windowYears: number | null
    tooltip: ReturnType<typeof useHeroReadings>['tooltip']
  },
) {
  const { chartSeries, fiChartMarker, startMarks, formatValue } = marks
  const { lines: refLines, curves: refCurves, highlight: refHighlight, annotations } = marks.pick
  const { labels, markerYears, yDomainMax } = drawn
  const { lifeEventMarkers, todayIndex, windowYears, tooltip } = extra
  return useMemo(
    () => ({
      series: chartSeries,
      xLabels: labels,
      refLines,
      refCurves,
      refHighlight,
      annotations,
      startMarks,
      markerYears,
      lifeEventMarkers,
      ...todayProp(todayIndex, windowYears),
      yDomainMax,
      aboveTop: fiChartMarker,
      ariaLabel: projectionLabel(fiChartMarker),
      formatValue,
      tooltip,
    }),
    [
      chartSeries,
      labels,
      refLines,
      refCurves,
      refHighlight,
      annotations,
      startMarks,
      markerYears,
      lifeEventMarkers,
      todayIndex,
      windowYears,
      yDomainMax,
      fiChartMarker,
      formatValue,
      tooltip,
    ],
  )
}
