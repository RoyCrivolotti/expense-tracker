import { useMemo, useRef } from 'react'
import { useInBand } from '../../../charts/useInBand'
import { useAssumedInflation } from '../../../hooks/assumedInflationContext'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { useGoalsNarrow } from '../useGoalsNarrow'
import { useActiveIndex } from './heroSheet/useActiveIndex'
import { useHeroSheet } from './heroSheet/useHeroSheet'
import { chartMoneyLabel } from '../planMoneyLabel'
import { useHeroReadings } from './heroReadings'
import { chartHint, variantProps } from './netWorthChartProps'
import type { ChartEnv, ChartInput } from './netWorthChartTypes'
import { projectionAtPreview, useLifeEventMarkers } from './netWorthSeriesHooks'
import { useAxisLines, useDrawnSeries, type Drawn, type Placed } from './useNetWorthLines'
import { useChartMarks, useSheetChart } from './useNetWorthMarks'

/** The figures the legend, chips and tooltip state, for the lines drawn. */
function useReadings(
  env: ChartEnv,
  placed: Placed,
  drawn: Drawn,
  activeIndex: number | null,
) {
  const { nominalMode, projectionRate, scenarios, hiddenIds, legendStore } = env
  return useHeroReadings({
    lines: placed.lines,
    points: placed.full.points,
    displaySeries: drawn.displaySeries,
    names: placed.full.names,
    years: drawn.years,
    inflationRate: projectionRate,
    nominalMode,
    scenarios,
    hiddenIds,
    calendarOrigin: placed.calendarOrigin,
    activeIndex,
    legendStore,
    fromTodayLine: drawn.fromTodayLine,
    fromTodayLabel: drawn.fromTodayLabel,
  })
}

/** The full-screen chart's model and the sheet itself. */
function useSheet(
  env: ChartEnv,
  placed: Placed,
  sheetChart: ReturnType<typeof useSheetChart>,
  sheetReading: ReturnType<typeof useHeroReadings>['sheetReading'],
  fromToday: Pick<Drawn, 'fromTodayLine' | 'fromTodayLabel'>,
  lastIndex: ReturnType<typeof useActiveIndex>['lastIndex'],
) {
  const { nominalMode, onToggleVisible, displaySwitch, format, isHero } = env
  const { fromTodayLine, fromTodayLabel } = fromToday
  const { axis, heroWindows, heroWindow, setHeroWindow } = placed
  const sheetLegend = useMemo(
    () => ({ ...sheetReading, fromTodayLine, fromTodayLabel, nominalMode, onToggleVisible }),
    [sheetReading, fromTodayLine, fromTodayLabel, nominalMode, onToggleVisible],
  )
  const money = chartMoneyLabel(axis.origin, nominalMode, format)
  const { onOpen: onOpenSheet, sheet } = useHeroSheet(
    {
      chart: sheetChart,
      legend: sheetLegend,
      displaySwitch,
      money,
      windows: heroWindows,
      windowValue: heroWindow,
      onWindowChange: setHeroWindow,
    },
    isHero,
    lastIndex,
  )
  return { money, onOpenSheet, sheet }
}

/** The card's environment: the props with their defaults, and what the card is drawn in. */
function useChartEnv(input: ChartInput): ChartEnv {
  const format = useMoneyFormat()
  const assumedInflation = useAssumedInflation()
  const narrow = useGoalsNarrow()
  const isHero = input.variant === 'hero'
  const { previewing, projectionRate } = projectionAtPreview(input.nominalMode, input.viewInflation, assumedInflation)
  return { ...input, format, assumedInflation, narrow, isHero, previewing, projectionRate }
}

/** Everything the net worth chart card draws, worked out in the order the card has always worked it out. */
export function useNetWorthChart(input: ChartInput) {
  const env = useChartEnv(input)
  const { isHero, narrow, draft, todayIndex } = env
  const listRef = useRef<HTMLUListElement>(null)
  const { activeIndex, onActiveIndexChange, lastIndex } = useActiveIndex()
  const legendInBand = useInBand(listRef, 1, { enabled: narrow })
  const placed = useAxisLines(env)
  const drawn = useDrawnSeries(env, placed)
  const marks = useChartMarks(env, placed, drawn)
  const readings = useReadings(env, placed, drawn, activeIndex)
  const lifeEventMarkers = useLifeEventMarkers(isHero, draft, placed.windowYears, placed.draftOffset)
  const heroVariantProps = variantProps(
    isHero,
    narrow,
    legendInBand,
    drawn.markerYears,
    lifeEventMarkers,
    onActiveIndexChange,
  )
  const sheetChart = useSheetChart(marks, drawn, {
    lifeEventMarkers,
    todayIndex,
    windowYears: placed.windowYears,
    tooltip: readings.tooltip,
  })
  const sheet = useSheet(env, placed, sheetChart, readings.sheetReading, drawn, lastIndex)
  const hint = chartHint(isHero, narrow, sheet.money, draft.expectedRealReturn)
  return { env, listRef, activeIndex, placed, drawn, marks, readings, lifeEventMarkers, heroVariantProps, sheet, hint }
}

export type NetWorthChartModel = ReturnType<typeof useNetWorthChart>
