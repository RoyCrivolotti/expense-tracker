import { useEffect } from 'react'
import type { Transaction } from '../../types'
import { stillStopped } from '../../engine'
import { Card, SectionTitle } from '../components/primitives'
import { formatDayLabel } from '../format'
import { useStoppedSuggestions } from '../tabs/stoppedSuggestions'
import tabStyles from '../tabs/tabs.module.css'
import styles from './StoppedSuggestionsSetting.module.css'

/**
 * The series the Upcoming card was told to stop suggesting on this device, each with a way to
 * take it back. A stopped series is otherwise out of sight, so there has to be somewhere to see
 * what is not being watched. A series that has come back, because a charge for it was logged after
 * it was stopped, is not listed. Nothing is shown while nothing is stopped.
 *
 * A model that holds only a window of the ledger may not hold the charge that brought a series back, so it gives the
 * date of every series' newest charge (`known`) and a way to ask for them (`watch`), which is done only while
 * something is stopped, since nothing else here needs them.
 */
export function StoppedSuggestionsSetting({
  transactions,
  known,
  watch,
}: {
  transactions: Transaction[]
  known?: ReadonlyMap<string, string> | undefined
  watch?: (() => () => void) | undefined
}) {
  const { stopped, restore } = useStoppedSuggestions()
  const anyStopped = Object.keys(stopped).length > 0
  useEffect(() => (anyStopped ? watch?.() : undefined), [anyStopped, watch])
  const entries = Object.entries(stillStopped(transactions, stopped, known)).sort(([, a], [, b]) => a.label.localeCompare(b.label))
  if (entries.length === 0) return null

  return (
    <>
      <SectionTitle>Suggestions you stopped</SectionTitle>
      <Card>
        <p className={tabStyles.settingHint}>
          The Upcoming card no longer suggests these on this device. One comes back by itself when you log a
          new charge for it.
        </p>
        <ul className={styles.list}>
          {entries.map(([seriesKey, entry]) => (
            <li key={seriesKey} className={styles.row}>
              <span className={styles.name}>
                <span className={styles.label}>{entry.label}</span>
                <span className={styles.meta}>Last charge {formatDayLabel(entry.after)}</span>
              </span>
              <button
                type="button"
                className={styles.restore}
                onClick={() => restore(seriesKey)}
                aria-label={`Suggest ${entry.label} again`}
              >
                Suggest again
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}
