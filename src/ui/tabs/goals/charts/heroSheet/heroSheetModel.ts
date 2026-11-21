import type { ComponentProps, ReactNode } from 'react'
import type { ChartSeries, LinearChart } from '../../../../charts/LinearChart'
import type { LegendInput } from '../heroLegendState'

type ChartProps = ComponentProps<typeof LinearChart>

/**
 * What the hero chart's card has already worked out, handed to the full-screen sheet so that it
 * draws the same chart for the same choices (the window, the lines shown, Nominal or Purchasing
 * power) without working any of it out again. It is built once and held, so the sheet's own state
 * (the year pointed at) never makes the chart recompute it.
 */
export interface HeroSheetModel {
  chart: Pick<
    ChartProps,
    | 'series'
    | 'xLabels'
    | 'refLines'
    | 'refCurves'
    | 'refHighlight'
    | 'annotations'
    | 'startMarks'
    | 'markerYears'
    | 'lifeEventMarkers'
    | 'todayIndex'
    | 'yDomainMax'
    | 'aboveTop'
    | 'ariaLabel'
    | 'formatValue'
    | 'tooltip'
  >
  /** What the readout beside the chart lists for the year pointed at. */
  legend: LegendInput & {
    /** The year the readout's figures are for while none is pointed at; null for none. */
    restIndex: number | null
    /** Which year that is, said under the readout's hint. */
    restNote: string | undefined
    fromTodayLine: ChartSeries | null
    fromTodayLabel: string
    nominalMode: boolean
    onToggleVisible: ((scenarioId: number) => void) | undefined
  }
  /** What the chart's euros are ("in 2026 euros", or the account's in the Nominal view), said in the sheet's bar. */
  money: string
  /** The card's own window buttons, which change the card as well. */
  windowPicker: ReactNode
  /** Nominal or Purchasing power, which the page owns. */
  displaySwitch: ReactNode
}
