import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { formatMoneyShort } from './chartTheme'
import { formatCheckinDate, type InvestedSnapshot } from './checkinDate'
import styles from './goals.module.css'

export interface StartFromTodayControl {
  on: boolean
  onChange: (on: boolean) => void
}

/**
 * Looks at every scenario as if it had started from the invested balance in the latest check-in,
 * so they are compared with each other, and with where you are, from the same point. It says which
 * balance and date that is, since the toggle changes what every line starts from.
 */
export function StartFromTodayToggle({
  control,
  latest,
  notRestarted = [],
}: {
  control: StartFromTodayControl
  latest: InvestedSnapshot | null
  /** Scenarios that keep their own start while it is on, said by name so no line is taken for one that moved. */
  notRestarted?: string[]
}) {
  const format = useMoneyFormat()
  const on = control.on && latest !== null
  return (
    <div className={styles.startToday}>
      <button
        type="button"
        className={styles.startTodayButton}
        aria-pressed={on}
        disabled={!latest}
        onClick={() => control.onChange(!control.on)}
      >
        Start all scenarios from my balance today
      </button>
      <p className={styles.startTodayHint}>
        {latest
          ? `From ${formatMoneyShort(latest.investedCents, format)} on ${formatCheckinDate(latest.date)}, your latest check-in (invested money only).${
              on
                ? ' Each scenario keeps its own monthly amount, house and return; its starting balance and start date are replaced while this is on, and nothing is saved. To make it permanent for one scenario, restart it under Plan start.'
                : ''
            }${
              on && notRestarted.length > 0
                ? ` Not restarted: ${notRestarted.join(', ')}. ${notRestarted.length === 1 ? 'It buys' : 'They buy'} the house at year 0, so the starting balance is what is left after buying it, which a check-in cannot stand in for.`
                : ''
            }`
          : 'Log a wealth check-in first.'}
      </p>
    </div>
  )
}
