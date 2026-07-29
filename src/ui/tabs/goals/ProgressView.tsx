import { useState } from 'react'
import type { GoalScenario, Milestone, WealthAccount, WealthCheckin } from '../../../types'
import type { ExpenseActions } from '../../actions'
import { WealthSummaryCard } from './WealthSummaryCard'
import { ReachedMilestones } from './ReachedMilestones'
import { CheckinFormSheet } from './CheckinFormSheet'
import { CheckinList } from './CheckinList'
import { CheckinHistoryChart } from './charts/CheckinHistoryChart'
import { WealthAccountsManager } from './WealthAccountsManager'
import styles from './progress.module.css'
import goalStyles from './goals.module.css'

interface Props {
  accounts: WealthAccount[]
  checkins: WealthCheckin[]
  milestones: Milestone[]
  /** amountCents -> date first observed at or above, from check-in history. */
  reached: Map<number, string>
  activeScenario: GoalScenario | null
  actions: ExpenseActions | undefined
  canWrite: boolean
}

export function ProgressView({
  accounts,
  checkins,
  milestones,
  reached,
  activeScenario,
  actions,
  canWrite,
}: Props) {
  const [showCheckinForm, setShowCheckinForm] = useState(false)

  return (
    <div className={styles.progressStack}>
      <WealthSummaryCard
        checkins={checkins}
        accounts={accounts}
        activeScenario={activeScenario}
      />

      <ReachedMilestones milestones={milestones} reached={reached} />

      <CheckinHistoryChart
        checkins={checkins}
        accounts={accounts}
        activeScenario={activeScenario}
      />

      {canWrite && actions ? (
        showCheckinForm ? (
          <CheckinFormSheet
            accounts={accounts}
            actions={actions}
            onDone={() => setShowCheckinForm(false)}
          />
        ) : (
          <button
            className={goalStyles.btn}
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setShowCheckinForm(true)}
          >
            + Log check-in
          </button>
        )
      ) : null}

      <CheckinList
        checkins={checkins}
        accounts={accounts}
        activeScenario={activeScenario}
        canWrite={canWrite}
        actions={actions}
      />

      {canWrite && actions ? (
        <WealthAccountsManager accounts={accounts} actions={actions} />
      ) : null}
    </div>
  )
}
