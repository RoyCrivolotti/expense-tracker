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
  /** What the charts read: the editor's deferred draft. */
  draft: NewGoalScenario
  latest: InvestedSnapshot | null
  monthly: MonthlyFlow[]
  milestones: Milestone[]
  reached: Map<number, string>
  activeId: number | null
  dirty: boolean
  fromToday: PlanFromToday | null
}

/**
 * Everything under the projection in two columns that each stack their own cards, so none is
 * stretched to match its neighbour: the two tables that compare paths lead, then where the plan
 * stands beside what it is made of, the drawdown beside the rent against buying, and the
 * investing against plan. The cards are the ones the phone has as tabs.
 */
export function DetailGrid({
  scenarios,
  draft,
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
      <div className={styles.detailGrid}>
        <div className={styles.detailColumn}>
          <ScenarioComparison scenarios={scenarios} draft={draft} includeDraft={includeDraft} fromToday={fromToday} />
          <NetWorthNowCard draft={draft} latest={latest} milestones={milestones} reached={reached} />
          <FireChart draft={draft} height={STACK_CHART_HEIGHT} />
          <SavingsRateChart draft={draft} monthly={monthly} height={STACK_CHART_HEIGHT} />
        </div>
        <div className={styles.detailColumn}>
          <MilestoneMatrix
            scenarios={scenarios}
            draft={draft}
            milestones={milestones}
            reached={reached}
            includeDraft={includeDraft}
            fromToday={fromToday}
          />
          <CompositionChart draft={draft} height={STACK_CHART_HEIGHT} />
          <RentVsOwnChart draft={draft} height={STACK_CHART_HEIGHT} />
        </div>
      </div>
    </section>
  )
}
