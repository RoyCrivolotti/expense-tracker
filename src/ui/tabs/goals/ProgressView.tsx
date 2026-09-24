import { useState } from 'react'
import type { GoalScenario, Milestone, Transaction, WealthAccount, WealthCheckin } from '../../../types'
import type { ExpenseActions } from '../../actions'
import { latestCheckin } from '../../../engine'
import { EmptyState } from '../../components/primitives'
import { WealthSummaryCard } from './WealthSummaryCard'
import { ReachedMilestones } from './ReachedMilestones'
import { CheckinFormSheet } from './CheckinFormSheet'
import { CheckinList } from './CheckinList'
import { CheckinHistoryChart } from './charts/CheckinHistoryChart'
import { NetWorthHistoryChart } from './charts/NetWorthHistoryChart'
import styles from './progress.module.css'
import goalStyles from './goals.module.css'

interface Props {
  accounts: WealthAccount[]
  checkins: WealthCheckin[]
  /** For the measured return: investment transactions are the contributions. */
  transactions?: Transaction[]
  milestones: Milestone[]
  /** amountCents -> date first observed at or above, from check-in history. */
  reached: Map<number, string>
  plan: GoalScenario | null
  actions: ExpenseActions | undefined
  canWrite: boolean
  /** Takes the user to the Setup view, where accounts are named. */
  onOpenSetup?: (() => void) | undefined
}

export function ProgressView({
  accounts,
  checkins,
  transactions = [],
  milestones,
  reached,
  plan,
  actions,
  canWrite,
  onOpenSetup,
}: Props) {
  const [showCheckinForm, setShowCheckinForm] = useState(false)
  // A check-in records a balance per account, so with none there is nothing to log yet.
  const hasAccounts = accounts.some((a) => !a.archived)

  return (
    <div className={styles.progressStack}>
      <WealthSummaryCard
        checkins={checkins}
        accounts={accounts}
        plan={plan}
        transactions={transactions}
      />

      <NetWorthHistoryChart checkins={checkins} accounts={accounts} />

      <CheckinHistoryChart
        checkins={checkins}
        accounts={accounts}
        plan={plan}
      />

      <ReachedMilestones milestones={milestones} reached={reached} />

      {canWrite && actions && !hasAccounts ? (
        <EmptyState actionLabel="Set up accounts" onAction={onOpenSetup}>
          Name the accounts you track before logging a check-in.
        </EmptyState>
      ) : null}

      {canWrite && actions && hasAccounts ? (
        showCheckinForm ? (
          <CheckinFormSheet
            accounts={accounts}
            previous={latestCheckin(checkins)}
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
        plan={plan}
        canWrite={canWrite}
        actions={actions}
      />
    </div>
  )
}
