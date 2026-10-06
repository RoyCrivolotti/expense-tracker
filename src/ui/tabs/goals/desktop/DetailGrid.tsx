import type { GoalScenario, Milestone } from '../../../../types'
import type { NewGoalScenario } from '../../../../data/dataSource'
import type { MonthlyFlow, PlanFromToday } from '../../../../engine'
import { CompositionChart } from '../charts/CompositionChart'
import { FireChart } from '../charts/FireChart'
import { MilestoneMatrix } from '../charts/MilestoneMatrix'
import { NetWorthNowCard } from '../charts/NetWorthNowCard'
import { RentVsOwnChart } from '../charts/RentVsOwnChart'
import { SavingsRateChart } from '../charts/SavingsRateChart'
import { ScenarioComparison } from '../charts/ScenarioComparison'
import type { InvestedSnapshot } from '../checkinDate'
import { STACK_CHART_HEIGHT } from '../secondaryChartHeight'
import styles from './planDesktop.module.css'

interface DetailGridProps {
  scenarios: GoalScenario[]
  /** What the charts read: the editor's deferred draft, restarted from the latest check-in while that is on. */
  draft: NewGoalScenario
  /**
   * The draft as the editor has it, for the two readings of actual money against the plan, which
   * need the plan's real start. Defaults to `draft`.
   */
  savedDraft?: NewGoalScenario
  latest: InvestedSnapshot | null
  monthly: MonthlyFlow[]
  milestones: Milestone[]
  reached: Map<number, string>
  activeId: number | null
  dirty: boolean
  fromToday: PlanFromToday | null
}

/**
 * Everything under the projection. The years to each milestone lead across the whole page: its
 * table needs about 530px, which a half column only has from 1440px wide, and a table that scrolls
 * sideways hides a column (the 1M milestone at 1280px) with nothing to say so. The rest are two
 * columns that each stack their own cards, so none is stretched to match its neighbour: the paths
 * side by side, the drawdown and the investing against plan, beside where the plan stands, what it
 * is made of and the rent against buying. Split three and three so the columns end within a card's
 * height of each other (measured: 1,108px against 1,034px at 1440px wide), where four against two
 * left one a card and a half longer. The cards are the ones the phone has as tabs.
 */
export function DetailGrid({
  scenarios,
  draft,
  savedDraft = draft,
  latest,
  monthly,
  milestones,
  reached,
  activeId,
  dirty,
  fromToday,
}: DetailGridProps) {
  // The live edits are a line of their own only while they differ from what is saved.
  const includeDraft = activeId === null || dirty
  return (
    <section className={styles.detail} aria-labelledby="goals-detail-heading">
      <h3 id="goals-detail-heading" className={styles.detailHeading}>
        Detailed charts
      </h3>
      <div className={styles.detailWide}>
        <MilestoneMatrix
          scenarios={scenarios}
          draft={draft}
          milestones={milestones}
          reached={reached}
          includeDraft={includeDraft}
          fromToday={fromToday}
        />
      </div>
      <div className={styles.detailGrid}>
        <div className={styles.detailColumn}>
          <ScenarioComparison scenarios={scenarios} draft={draft} includeDraft={includeDraft} fromToday={fromToday} />
          <FireChart draft={draft} height={STACK_CHART_HEIGHT} />
          <SavingsRateChart draft={savedDraft} monthly={monthly} height={STACK_CHART_HEIGHT} />
        </div>
        <div className={styles.detailColumn}>
          <NetWorthNowCard draft={savedDraft} latest={latest} milestones={milestones} reached={reached} />
          <CompositionChart draft={draft} height={STACK_CHART_HEIGHT} />
          <RentVsOwnChart draft={draft} height={STACK_CHART_HEIGHT} />
        </div>
      </div>
    </section>
  )
}
