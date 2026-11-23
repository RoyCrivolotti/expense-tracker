import { shortMonthLabel } from '../../engine'
import { formatCents } from '../../engine/money'
import type { Lookup } from '../format'
import { formatDayLabel, shortDayLabel } from '../format'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { NoEntryIcon } from '../icons'
import { dueLabel, daysUntilDue } from './dueLabel'
import type { MarkedSuggestion, RecurringMark } from './useRecurringMarks'
import styles from './UpcomingCard.module.css'

interface InfoProps {
  suggestion: MarkedSuggestion
  /** The budget month "+" files the charge under, when that is not the one on screen. */
  forMonth: string | null
  today: string
  lookup: Lookup
  /** Opens the add form, on the charge's waiting bank push when one stands for it. */
  onAdd: () => void
}

/** A date as one word, so "23 Nov" never breaks across lines. */
const day = (iso: string) => shortDayLabel(iso).replace(' ', '\u00a0')

/**
 * What a charge's waiting bank push, or a row logged under another name, says about it. The push's line opens it, as
 * "+" does: it reads as an action, and is the bigger target of the two.
 */
function MarkLines({
  mark,
  description,
  onAdd,
}: {
  mark: RecurringMark | undefined
  description: string
  onAdd: () => void
}) {
  return (
    <>
      {mark?.push && (
        <button
          type="button"
          className={styles.captured}
          aria-label={`Captured from your bank, review ${description}`}
          onClick={onAdd}
        >
          Captured from your bank, review
        </button>
      )}
      {mark?.maybeAdded && (
        <span className={styles.maybe}>
          Maybe already added on {day(mark.maybeAdded.date)} as {mark.maybeAdded.description}
        </span>
      )}
    </>
  )
}

/** What the charge is and when it is due. */
function RowInfo({ suggestion, forMonth, today, lookup, onAdd }: InfoProps) {
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
        <MarkLines mark={suggestion.mark} description={suggestion.description} onAdd={onAdd} />
      </span>
    </div>
  )
}

interface ButtonProps {
  description: string
  /** True when "+" opens the charge's waiting bank push rather than a new row. */
  review: boolean
  onAdd: () => void
  onDismiss: () => void
  onStop: () => void
}

function RowButtons({ description, review, onAdd, onDismiss, onStop }: ButtonProps) {
  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={styles.addBtn}
        onClick={onAdd}
        aria-label={review ? `Review ${description} from your bank` : `Add ${description}`}
      >
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

/**
 * One charge on the Upcoming card: what it is, when it is due, what the bank pushes say about it, and its add, dismiss
 * and stop buttons. A charge a waiting push stands for opens that push on "+", so the payment is not added twice.
 */
export function SuggestionRow({
  last,
  onDismiss,
  onStop,
  ...info
}: InfoProps & {
  /** The last row of a card with nothing under it, so it has no line below. */
  last: boolean
  onDismiss: () => void
  onStop: () => void
}) {
  return (
    <div className={last ? `${styles.row} ${styles.rowLast}` : styles.row} data-row>
      <RowInfo {...info} />
      <RowButtons
        description={info.suggestion.description}
        review={!!info.suggestion.mark?.push}
        onAdd={info.onAdd}
        onDismiss={onDismiss}
        onStop={onStop}
      />
    </div>
  )
}
