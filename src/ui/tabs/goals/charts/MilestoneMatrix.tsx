import { memo, useMemo, useState } from 'react'
import { useAssumedInflation } from '../../..//hooks/assumedInflationContext'
import type { GoalScenario, Milestone } from '../../../../types'
import type { PlanFromToday } from '../../../../engine'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { SegmentedControl } from '../../../components/SegmentedControl'
import { todayIso } from '../../../components/transactionFormState'
import { ChartShell } from './ChartShell'
import { MatrixBody } from './MatrixBody'
import { MilestoneTimeline } from './MilestoneTimeline'
import { buildRows } from './milestoneModel'
import { useGoalsNarrow } from '../useGoalsNarrow'
import styles from '../goals.module.css'

const VIEWS = [
  { value: 'table', label: 'Table' },
  { value: 'timeline', label: 'Timeline' },
] as const

type View = (typeof VIEWS)[number]['value']

function MilestoneMatrixImpl({
  scenarios,
  draft,
  milestones,
  reached,
  includeDraft = true,
  fromToday = null,
  embedded = false,
}: {
  scenarios: GoalScenario[]
  draft: NewGoalScenario
  milestones: Milestone[]
  /** amountCents -> date first observed at or above, from check-in history. */
  reached: Map<number, string>
  /** False when the draft is a loaded scenario with no edits, which already has its row. */
  includeDraft?: boolean
  /** The plan restarted from the latest check-in, listed under the plan. */
  fromToday?: PlanFromToday | null | undefined
  embedded?: boolean
}) {
  const inflationRate = useAssumedInflation()
  const today = todayIso()
  const rows = useMemo(
    () => buildRows(scenarios, draft, milestones, inflationRate, includeDraft, fromToday, today),
    [scenarios, draft, milestones, inflationRate, includeDraft, fromToday, today],
  )
  // The timeline is for the wide page; the phone has the table alone.
  const narrow = useGoalsNarrow()
  const [choice, setChoice] = useState<View>('table')
  const view = narrow ? 'table' : choice

  return (
    <ChartShell embedded={embedded}>
      <div className={styles.matrixHeader}>
        <h3 className={styles.chartTitle}>Years to milestone</h3>
        {narrow || milestones.length === 0 ? null : (
          <SegmentedControl
            options={[...VIEWS]}
            value={view}
            onChange={setChoice}
            ariaLabel="Show years to milestone as"
          />
        )}
      </div>
      <p className={styles.chartHint}>
        Invested portfolio only. Edit the list in Assumptions. A milestone is an amount on your account, so each path is
        counted after inflation. Every path is counted in whole years from today, rounded up from the day it first
        reaches the amount, so it can be up to a year later than the date on the Progress tab.
        {fromToday ? ' "From today" is the plan started again from your latest check-in.' : ''}
        {view === 'timeline' ? ' Each dot is a milestone, at the years from now the path reaches it.' : ''}
      </p>
      {milestones.length === 0 ? (
        <p className={styles.chartHint}>No milestones set.</p>
      ) : (
        <>
          <div hidden={view !== 'table'}>
            <MatrixBody rows={rows} milestones={milestones} reached={reached} />
          </div>
          {view === 'timeline' ? (
            <MilestoneTimeline rows={rows} milestones={milestones} reached={reached} today={today} />
          ) : null}
        </>
      )}
    </ChartShell>
  )
}

export const MilestoneMatrix = memo(MilestoneMatrixImpl)
