import type { SeedNotice as Notice } from '../actions'
import styles from './TransactionForm.module.css'

/**
 * A note under the date for a payment that could be dated two ways, with a button that moves between them. The budget
 * month follows the date, as it does when the date is changed by hand.
 */
export function SeedNotice({ notice, date, onDate }: { notice: Notice; date: string; onDate: (date: string) => void }) {
  const atOriginal = date === notice.original.date
  const target = atOriginal ? notice.alternate : notice.original
  return (
    <p className={styles.notice} role="note">
      {notice.text}{' '}
      <button type="button" className={styles.noticeButton} onClick={() => onDate(target.date)}>
        {atOriginal ? `Use ${target.label}` : `Back to ${target.label}`}
      </button>
    </p>
  )
}
