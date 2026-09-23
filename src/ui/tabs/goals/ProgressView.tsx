import { useState } from 'react'
import type { GoalScenario, Milestone, Transaction, WealthAccount, WealthCheckin } from '../../../types'
import type { ExpenseActions } from '../../actions'
import { checkinInvestedCents, latestCheckin } from '../../../engine'
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
  /** Start with the check-in form open, as the dashboard's nudge asks. */
  openCheckinForm?: boolean
}

/**
 * The same write the Plan view's re-baseline button makes, but straight to the plan
 * rather than through the editor's draft, since Progress has no draft to save.
 */
function rebaselineFrom(
  actions: ExpenseActions | undefined,
  plan: GoalScenario | null,
  latest: WealthCheckin | null,
  accounts: WealthAccount[],
): (() => void) | undefined {
  if (!actions || !plan || !latest) return undefined
  return () =>
    void actions.updateScenario(plan.id, {
      startInvestedCents: checkinInvestedCents(latest, accounts),
      planStartDate: latest.checkinDate,
    })
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
  openCheckinForm = false,
}: Props) {
  const [showCheckinForm, setShowCheckinForm] = useState(openCheckinForm)
  const latest = latestCheckin(checkins)
  // A check-in records a balance per account, so with none there is nothing to log yet.
  const hasAccounts = accounts.some((a) => !a.archived)

  return (
    <div className={styles.progressStack}>
      <WealthSummaryCard
        checkins={checkins}
        accounts={accounts}
        plan={plan}
        transactions={transactions}
        onRebaseline={rebaselineFrom(canWrite ? actions : undefined, plan, latest, accounts)}
      />

      <NetWorthHistoryChart checkins={checkins} accounts={accounts} />

      <CheckinHistoryChart
        checkins={checkins}
        accounts={accounts}
        plan={plan}
      />

      <ReachedMilestones milestones={milestones} reached={reached} plan={plan} />

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
