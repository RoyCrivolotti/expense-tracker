import { useEffect, useMemo, useState } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import type { Transaction } from '../../types'
import { latestTransactions, recentlyAdded } from '../../engine'
import { Card, SectionTitle } from '../components/primitives'
import { SegmentedControl } from '../components/SegmentedControl'
import { TransactionList } from '../components/TransactionList'
import styles from './tabs.module.css'

type ActivityMode = 'latest' | 'added'

const ACTIVITY_MODES: { value: ActivityMode; label: string }[] = [
  { value: 'latest', label: 'Latest' },
  { value: 'added', label: 'Recently added' },
]

const ACTIVITY_HINTS: Record<ActivityMode, string> = {
  latest: 'Newest by transaction date.',
  added: 'Last entries you logged — dates show when they happened.',
}

interface Props {
  model: ExpenseModel
  actions?: ExpenseActions | undefined
}

/**
 * What the server says the activity is, when the model holds only a window of the ledger: the newest rows may be in a
 * month it does not hold. Read again when the rows held change (a write, a refresh, another month), and null until the
 * first answer and when it fails (offline), when the rows held are all there is to list.
 */
function useServedActivity(recent: ExpenseModel['recent'], mode: ActivityMode, held: unknown): Transaction[] | null {
  const [served, setServed] = useState<{ mode: ActivityMode; rows: Transaction[] } | null>(null)
  useEffect(() => {
    if (!recent) return
    let alive = true
    recent[mode === 'latest' ? 'latest' : 'added']().then(
      (rows) => alive && setServed({ mode, rows }),
      () => alive && setServed(null),
    )
    return () => {
      alive = false
    }
  }, [recent, mode, held])
  return recent && served?.mode === mode ? served.rows : null
}

export function DashboardRecentActivity({ model, actions }: Props) {
  const { dataset, lookup, recent } = model
  const [mode, setMode] = useState<ActivityMode>('latest')
  const served = useServedActivity(recent, mode, dataset)

  const activity = useMemo(
    () => served ?? (mode === 'latest' ? latestTransactions(dataset.transactions) : recentlyAdded(dataset.transactions)),
    [dataset, mode, served],
  )

  return (
    <>
      <div className={styles.sectionHeader}>
        <SectionTitle>Recent activity</SectionTitle>
        <SegmentedControl
          options={ACTIVITY_MODES}
          value={mode}
          onChange={setMode}
          ariaLabel="Recent activity sort"
        />
      </div>
      <p className={styles.activityHint}>{ACTIVITY_HINTS[mode]}</p>
      <Card>
        <TransactionList
          rows={activity.map((txn) => ({ kind: 'transaction' as const, txn }))}
          lookup={lookup}
          flat
          showDate
          {...(actions ? { onSelect: actions.onEdit } : {})}
        />
      </Card>
    </>
  )
}
