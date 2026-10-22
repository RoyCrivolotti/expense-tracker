import type { ExpenseModel } from '../useExpenseData'
import styles from './HistoryNote.module.css'

/**
 * Says so while a model that holds only some of the rows has no recurring charges to split fixed from flexible spend
 * by, so that figures worked out from the loaded months do not pass for exact ones. The model has the words.
 */
export function HistoryNote({ model: { historyNote } }: { model: ExpenseModel }) {
  if (!historyNote) return null
  return (
    <p className={styles.note} role="status">
      {historyNote}
    </p>
  )
}
