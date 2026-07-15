import { useMemo, useState } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
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

export function DashboardRecentActivity({ model, actions }: Props) {
  const { dataset, lookup } = model
  const [mode, setMode] = useState<ActivityMode>('latest')

  const activity = useMemo(() => {
    const list =
      mode === 'latest'
        ? latestTransactions(dataset.transactions)
        : recentlyAdded(dataset.transactions)
    return list
  }, [dataset, mode])

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
