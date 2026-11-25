import { useMemo } from 'react'
import { axisLabels, buildSeries, heroAxis, purchaseMarkerIndices, scenarioLines } from './heroSeries'
import { axisSpans } from './heroRestYear'
import { computeChartDisplayData } from './nominalTransform'
import type { ChartEnv } from './netWorthChartTypes'
import {
  fromTodayDrawing,
  placesOnAxis,
  useBandSeries,
  useFromTodaySeries,
  useHeroWindow,
  useSavedRateFloor,
  useWindowedSeries,
} from './netWorthSeriesHooks'

/** The axis, the lines on it and the window of years drawn. */
export function useAxisLines(env: ChartEnv) {
  const { scenarios, draft, activeId, dirty, projectionRate, format, hiddenIds, fromToday, isHero } = env
  const axis = useMemo(() => heroAxis(scenarios, draft), [scenarios, draft])
  const { calendarOrigin, draftOffset, planOffset } = placesOnAxis(axis, draft, fromToday)
  const lines = useMemo(
    () => scenarioLines(scenarios, draft, activeId, dirty, projectionRate, axis, format, hiddenIds),
    [scenarios, draft, activeId, dirty, projectionRate, axis, format, hiddenIds],
  )
  const full = useMemo(
    () => buildSeries(lines, projectionRate, axisSpans(lines, scenarios, axis.origin).ends),
    [lines, projectionRate, axis.origin, scenarios],
  )
  // The windows on offer follow how far the chart actually runs, which is the longest
  // drawn horizon, not only the draft's.
  const extentYears = full.years[full.years.length - 1] ?? draft.horizonYears
  const heroWindowState = useHeroWindow(isHero, extentYears)
  return { axis, calendarOrigin, draftOffset, planOffset, lines, full, extentYears, ...heroWindowState }
}

/** The lines cut at the window and put in the view's money. */
export function useDrawnSeries(
  env: ChartEnv,
  placed: ReturnType<typeof useAxisLines>,
) {
  const { scenarios, draft, activeId, dirty, assumedInflation, hiddenIds, isHero, narrow, fromToday } = env
  const { nominalMode, viewInflation, previewing, projectionRate, extraSeries } = env
  const { axis, calendarOrigin, draftOffset, planOffset, lines, full, extentYears, windowYears } = placed
  const band = useBandSeries(isHero, draft, projectionRate, draftOffset)
  const fromTodaySeries = useFromTodaySeries(isHero, fromToday, projectionRate, windowYears, extentYears, planOffset)
  const windowed = useWindowedSeries(full, band, extraSeries, windowYears)
  const { years, series, extra } = windowed
  const markerYears = useMemo(() => purchaseMarkerIndices(lines, years), [lines, years])
  const labels = useMemo(() => axisLabels(years, calendarOrigin, narrow), [years, calendarOrigin, narrow])

  // Each view fits its own axis, so Purchasing power is not stretched to the nominal plan's
  // height; toggling rescales, and only Nominal holds a floor (for the rate preview).
  const floorSeries = useSavedRateFloor(
    previewing,
    scenarios,
    draft,
    activeId,
    dirty,
    assumedInflation,
    hiddenIds,
    windowYears,
    axis,
  )
  const display = useMemo(
    () =>
      computeChartDisplayData(
        series,
        extra,
        years,
        nominalMode,
        assumedInflation,
        windowed.band,
        viewInflation,
        fromTodaySeries ? [fromTodaySeries] : [],
        floorSeries,
      ),
    [series, extra, years, nominalMode, assumedInflation, windowed.band, viewInflation, fromTodaySeries, floorSeries],
  )
  const { line: fromTodayLine, label: fromTodayLabel } = fromTodayDrawing(display.displayRealPoints, fromToday)
  return { years, series, markerYears, labels, ...display, fromTodayLine, fromTodayLabel }
}

export type Placed = ReturnType<typeof useAxisLines>
export type Drawn = ReturnType<typeof useDrawnSeries>
