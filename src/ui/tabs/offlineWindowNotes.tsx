import type { TxnFilter } from '../../engine'
import type { ListView } from '../transactionListView'
import styles from './tabs.module.css'

/**
 * What the Transactions list says when the browser is offline and holds only some months' rows: a month that is not
 * saved here has totals and no rows, which an empty list would not explain, and a list over several months is of the
 * months saved. Drawn in place of the empty list and under the list.
 */
export function offlineWindowNotes(saved: ReadonlySet<string>, filter: TxnFilter): Pick<ListView, 'failed' | 'footer'> {
  const unsaved = filter.month !== undefined && !filter.dateFrom && !filter.dateTo && !saved.has(filter.month)
  const count = saved.size
  return {
    ...(unsaved ? { failed: <p className={styles.windowNote}>Not saved on this device. Connect to see its rows.</p> } : {}),
    footer: <p className={styles.windowNote}>Showing the {count} month{count === 1 ? '' : 's'} saved here.</p>,
  }
}
