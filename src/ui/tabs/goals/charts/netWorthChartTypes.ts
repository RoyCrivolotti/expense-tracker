import type { ReactNode } from 'react'
import type { GoalScenario, Milestone } from '../../../../types'
import type { NewGoalScenario } from '../../../../data/dataSource'
import type { MoneyFormat, PlanFromToday } from '../../../../engine'
import type { ChartSeries } from '../../../charts/LinearChart'
import type { HeroLegendStore } from './heroLegendStore'

export interface NetWorthChartProps {
  scenarios: GoalScenario[]
  draft: NewGoalScenario
  activeId?: number | null
  dirty?: boolean
  variant?: 'default' | 'hero'
  footer?: ReactNode
  /** The footer is a line of the card, not a box of its own. */
  footerBare?: boolean
  /** Beside the window buttons in the hero's header, where a wide screen has the room for it. */
  headerAside?: ReactNode
  /** Nominal or Purchasing power, for the full-screen chart's bar: unlike `headerAside` it is there on a phone too. */
  displaySwitch?: ReactNode
  extraSeries?: ChartSeries[]
  todayIndex?: number
  nominalMode?: boolean
  /** The plan restarted from the latest check-in, drawn dotted from the check-in on. */
  fromToday?: PlanFromToday | null | undefined
  /**
   * The rate the Nominal view projects and inflates the plan at while it is being previewed.
   * It changes only that drawing: the check-in dots, the Y-axis floor and everything beside
   * the chart stay at the saved assumed inflation, and it has no effect outside the Nominal
   * view.
   */
  viewInflation?: number | null | undefined
  milestones: Milestone[]
  /** Saved scenarios left off the chart; the legend lists them dimmed and can bring them back. */
  hiddenIds?: ReadonlySet<number> | undefined
  onToggleVisible?: ((scenarioId: number) => void) | undefined
  /**
   * Where the scenarios' chips, above the chart, read the lines from. With it the legend under the
   * chart lists only what has no chip (the plan from today).
   */
  legendStore?: HeroLegendStore | undefined
}

/** The props the chart works from, with their defaults filled in. */
export type ChartInput = Required<
  Pick<NetWorthChartProps, 'activeId' | 'dirty' | 'variant' | 'extraSeries' | 'nominalMode'>
> &
  Omit<NetWorthChartProps, 'activeId' | 'dirty' | 'variant' | 'extraSeries' | 'nominalMode'>

/** What every step below reads: the props, and what the card is drawn in. */
export interface ChartEnv extends ChartInput {
  format: MoneyFormat
  assumedInflation: number
  narrow: boolean
  isHero: boolean
  previewing: boolean
  projectionRate: number
}
