import { shortMonthLabel } from '../../engine'
import { formatCents } from '../../engine/money'
import type { Lookup } from '../format'
import { formatDayLabel } from '../format'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { NoEntryIcon } from '../icons'
import { dueLabel, daysUntilDue } from './dueLabel'
import type { UpcomingSuggestion } from './useUpcoming'
import styles from './UpcomingCard.module.css'

interface InfoProps {
  suggestion: UpcomingSuggestion
  /** The budget month "+" files the charge under, when that is not the one on screen. */
  forMonth: string | null
  today: string
  lookup: Lookup
}

/** What the charge is and when it is due. */
function RowInfo({ suggestion, forMonth, today, lookup }: InfoProps) {
  const format = useMoneyFormat()
  const categoryName = lookup.categoryName(suggestion.categoryId)
  const daysUntil = daysUntilDue(suggestion.predictedDate, today)
  return (
    <div className={styles.info}>
      <span className={styles.desc}>{suggestion.description}</span>
      <span className={styles.meta}>
        <span className={styles.what}>
          {categoryName} · {formatCents(suggestion.amountCents, format)}
        </span>
        <span className={styles.when}>
          <span className={daysUntil < 0 ? styles.late : daysUntil === 0 ? styles.today : undefined}>
            {dueLabel(daysUntil)}
          </span>
          {' · '}
          {formatDayLabel(suggestion.predictedDate)}
          {forMonth && (
            <>
              {' · '}
              <span className={styles.forMonth}>For {shortMonthLabel(forMonth)}</span>
            </>
          )}
        </span>
      </span>
    </div>
  )
}

interface ButtonProps {
  description: string
  onAdd: () => void
  onDismiss: () => void
  onStop: () => void
}

function RowButtons({ description, onAdd, onDismiss, onStop }: ButtonProps) {
  return (
    <div className={styles.actions}>
      <button type="button" className={styles.addBtn} onClick={onAdd} aria-label={`Add ${description}`}>
        +
      </button>
      <button type="button" className={styles.dismissBtn} onClick={onDismiss} aria-label={`Dismiss ${description}`}>
        ×
      </button>
      <button
        type="button"
        className={styles.stopBtn}
        onClick={onStop}
        aria-label={`Stop suggesting ${description}`}
        title="Stop suggesting"
      >
        <NoEntryIcon className={styles.stopIcon} aria-hidden="true" />
      </button>
    </div>
  )
}

/** One charge on the Upcoming card: what it is, when it is due, and its add, dismiss and stop buttons. */
export function SuggestionRow({
  last,
  onAdd,
  onDismiss,
  onStop,
  ...info
}: InfoProps & {
  /** The last row of a card with nothing under it, so it has no line below. */
  last: boolean
  onAdd: () => void
  onDismiss: () => void
  onStop: () => void
}) {
  return (
    <div className={last ? `${styles.row} ${styles.rowLast}` : styles.row} data-row>
      <RowInfo {...info} />
      <RowButtons description={info.suggestion.description} onAdd={onAdd} onDismiss={onDismiss} onStop={onStop} />
    </div>
  )
}
