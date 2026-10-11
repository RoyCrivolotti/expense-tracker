import type { ComponentProps, ReactNode } from 'react'
import type { GoalScenario } from '../../../../../types'
import type { ChartSeries, LinearChart } from '../../../../charts/LinearChart'
import type { ScenarioLine } from '../heroLegendState'

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
  legend: {
    lines: ScenarioLine[]
    displaySeries: ChartSeries[]
    names: string[]
    years: number[]
    scenarios: GoalScenario[]
    hiddenIds: ReadonlySet<number> | undefined
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
