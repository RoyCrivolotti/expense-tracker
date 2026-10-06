import { SegmentedControl } from '../../components/SegmentedControl'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { formatMoneyShort } from './chartTheme'
import { formatCheckinDate, type InvestedSnapshot } from './checkinDate'
import { useGoalsNarrow } from './useGoalsNarrow'
import styles from './goals.module.css'

export interface StartFromTodayControl {
  on: boolean
  onChange: (on: boolean) => void
}

type Start = 'saved' | 'today'

const OPTIONS: { value: Start; label: string }[] = [
  { value: 'saved', label: 'As saved' },
  { value: 'today', label: 'My balance today' },
]

/**
 * Which starting balance the scenarios are looked at from: the one each was saved with, or the
 * invested balance in the latest check-in. A way of looking and not a change, so it is a switch
 * between two views, as the chart's Nominal and Purchasing power are, with the balance and date it
 * would use said beside it and, while it is on, that nothing is saved. The long account of what is
 * replaced sits behind Details, and a scenario that keeps its own start is tagged on its tab.
 */
export function StartFromTodayRow({
  control,
  latest,
  notRestarted = [],
}: {
  control: StartFromTodayControl
  latest: InvestedSnapshot | null
  /** Scenarios that keep their own start while it is on, by name, for the account behind Details. */
  notRestarted?: string[]
}) {
  const format = useMoneyFormat()
  const narrow = useGoalsNarrow()
  const on = control.on && latest !== null
  const balance = latest ? `${formatMoneyShort(latest.investedCents, format)} on ${formatCheckinDate(latest.date)}` : null
  return (
    <div className={styles.startRow}>
      <div className={styles.startRowControl}>
        <span className={styles.startRowLabel}>Start from</span>
        <SegmentedControl
          options={OPTIONS}
          value={on ? 'today' : 'saved'}
          onChange={(next) => control.onChange(next === 'today')}
          ariaLabel="Where the scenarios start from"
          layout={narrow ? 'bar' : 'compact'}
          disabled={!latest}
        />
      </div>
      {!balance ? (
        <p className={styles.startRowStatus}>Log a wealth check-in to see the scenarios from your balance today.</p>
      ) : on ? (
        <div className={styles.startRowOn}>
          <p className={styles.startRowStatusOn}>
            Viewing every scenario from {balance}, your latest check-in. Nothing is saved.
          </p>
          <details className={styles.startRowDetails}>
            <summary>Details</summary>
            <p>
              Each scenario keeps its own monthly amount, house and return; only its starting balance and start date are
              replaced, and only invested money counts, not cash. To make it permanent for one scenario, restart it under
              Plan start.
            </p>
            {notRestarted.length > 0 ? (
              <p>
                {notRestarted.join(', ')} {notRestarted.length === 1 ? 'is' : 'are'} tagged "own start": {notRestarted.length === 1 ? 'it buys' : 'they buy'} the
                house at year 0, so the starting balance is what is left after buying it, which a check-in cannot stand in
                for.
              </p>
            ) : null}
          </details>
        </div>
      ) : (
        <p className={styles.startRowStatus}>My balance today is {balance}, your latest check-in (invested money only).</p>
      )}
    </div>
  )
}
