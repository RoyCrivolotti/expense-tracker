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

interface Props {
  control: StartFromTodayControl
  latest: InvestedSnapshot | null
}

/** "1,0M € on 6 Oct 2026": the balance and date the scenarios would start from; null without a check-in. */
function useBalance(latest: InvestedSnapshot | null): string | null {
  const format = useMoneyFormat()
  return latest ? `${formatMoneyShort(latest.investedCents, format)} on ${formatCheckinDate(latest.date)}` : null
}

/**
 * Which starting balance the scenarios are looked at from: the one each was saved with, or the
 * invested balance in the latest check-in. A way of looking and not a change, so it is a switch
 * between two views, as the chart's Nominal and Purchasing power are. It sits in the row of
 * scenario tabs on a wide screen, where it takes no height of its own (the chart's legend has
 * to stay clear of the inputs bar held under it), and at the top of the Scenarios card on a phone.
 */
export function StartFromTodaySwitch({ control, latest }: Props) {
  const narrow = useGoalsNarrow()
  const balance = useBalance(latest)
  const on = control.on && latest !== null
  return (
    <div
      className={styles.startRowControl}
      title={balance && !on ? `My balance today is ${balance}, your latest check-in (invested money only)` : undefined}
    >
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
  )
}

/**
 * What the switch is doing, in a line of its own that is there only while it has something to say:
 * that every scenario is being viewed from the check-in and nothing is saved, with the longer
 * account behind Details, or why there is nothing to switch to. Off with a check-in it says nothing
 * on a wide screen (the switch carries the balance in its tooltip); a phone has the room, so it
 * says which balance it would use.
 */
export function StartFromTodayStatus({
  control,
  latest,
  notRestarted = [],
  showWhenOff = false,
}: Props & {
  /** Scenarios that keep their own start while it is on, by name, for the account behind Details. */
  notRestarted?: string[]
  /** Say which balance it would use even while it is off. */
  showWhenOff?: boolean
}) {
  const balance = useBalance(latest)
  const on = control.on && balance !== null
  if (!balance) {
    return <p className={styles.startRowStatus}>Log a wealth check-in to see the scenarios from your balance today.</p>
  }
  if (!on) {
    return showWhenOff ? (
      <p className={styles.startRowStatus}>My balance today is {balance}, your latest check-in (invested money only).</p>
    ) : null
  }
  return (
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
            {notRestarted.join(', ')} {notRestarted.length === 1 ? 'is' : 'are'} tagged "own start":{' '}
            {notRestarted.length === 1 ? 'it buys' : 'they buy'} the house at year 0, so the starting balance is what is
            left after buying it, which a check-in cannot stand in for.
          </p>
        ) : null}
      </details>
    </div>
  )
}

/** The switch and its status together, which is how the Scenarios card on a phone has them. */
export function StartFromTodayRow({
  control,
  latest,
  notRestarted,
}: Props & { notRestarted?: string[] | undefined }) {
  return (
    <div className={styles.startRow}>
      <StartFromTodaySwitch control={control} latest={latest} />
      <StartFromTodayStatus control={control} latest={latest} showWhenOff {...(notRestarted ? { notRestarted } : {})} />
    </div>
  )
}
