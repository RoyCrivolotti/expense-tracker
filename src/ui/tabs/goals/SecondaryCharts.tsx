import { useEffect, useState } from 'react'
import type { GoalScenario, Milestone } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import { ScenarioComparison } from './charts/ScenarioComparison'
import { CompositionChart } from './charts/CompositionChart'
import { MilestoneMatrix } from './charts/MilestoneMatrix'
import { FireChart } from './charts/FireChart'
import { RentVsOwnChart } from './charts/RentVsOwnChart'
import { LazySpreadChart } from './charts/LazySpreadChart'
import { preloadSpreadChart } from './charts/spreadChartLoader'
import { SavingsRateChart } from './charts/SavingsRateChart'
import type { MonthlyFlow, PlanFromToday } from '../../../engine'
import { TabbedChart, type SecondaryView } from './SecondaryTabs'

const PRELOAD_DELAY_MS = 1_500

interface SecondaryChartsProps {
  scenarios: GoalScenario[]
  draft: NewGoalScenario
  monthly: MonthlyFlow[]
  milestones: Milestone[]
  reached: Map<number, string>
  /**
   * The draft is a row of its own in the tables only when it is a line of its own on the
   * chart: detached, or a loaded scenario with edits. Loaded and unchanged, it is that
   * scenario, and the chart draws it once.
   */
  activeId: number | null
  dirty: boolean
  /** The plan restarted from the latest check-in, for the tables that list scenarios. */
  fromToday: PlanFromToday | null
  /** The Nominal view: the spread is drawn in the money of each year, as the main chart is. */
  nominal?: boolean
  /** The card is hidden under the controls (the phone's Scenarios half): its replays wait until it is back. */
  paused?: boolean
}

function SecondaryViewChart({
  view,
  scenarios,
  draft,
  monthly,
  milestones,
  reached,
  includeDraft,
  fromToday,
  nominal,
  paused,
}: {
  view: SecondaryView
  scenarios: GoalScenario[]
  draft: NewGoalScenario
  monthly: MonthlyFlow[]
  milestones: Milestone[]
  reached: Map<number, string>
  includeDraft: boolean
  fromToday: PlanFromToday | null
  nominal: boolean
  paused: boolean
}) {
  switch (view) {
    case 'compare':
      return (
        <ScenarioComparison
          scenarios={scenarios}
          draft={draft}
          includeDraft={includeDraft}
          fromToday={fromToday}
          embedded
        />
      )
    case 'composition':
      return <CompositionChart draft={draft} embedded />
    case 'milestones':
      return (
        <MilestoneMatrix
          scenarios={scenarios}
          draft={draft}
          milestones={milestones}
          reached={reached}
          includeDraft={includeDraft}
          fromToday={fromToday}
          embedded
        />
      )
    case 'fire':
      return <FireChart draft={draft} embedded />
    case 'rent':
      return <RentVsOwnChart draft={draft} embedded />
    case 'savings':
      return <SavingsRateChart draft={draft} monthly={monthly} embedded />
    case 'spread':
      return <LazySpreadChart draft={draft} milestones={milestones} nominal={nominal} paused={paused} embedded />
  }
}

export function SecondaryCharts({
  scenarios,
  draft,
  monthly,
  milestones,
  reached,
  activeId,
  dirty,
  fromToday,
  nominal = false,
  paused = false,
}: SecondaryChartsProps) {
  const [view, setView] = useState<SecondaryView>('compare')
  const includeDraft = activeId === null || dirty
  // After the page has settled, so it does not compete with what the reader is looking at.
  useEffect(() => {
    const timer = setTimeout(preloadSpreadChart, PRELOAD_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  return (
    <TabbedChart view={view} onViewChange={setView}>
      <SecondaryViewChart
        view={view}
        scenarios={scenarios}
        draft={draft}
        monthly={monthly}
        milestones={milestones}
        reached={reached}
        includeDraft={includeDraft}
        fromToday={fromToday}
        nominal={nominal}
        paused={paused}
      />
    </TabbedChart>
  )
}
