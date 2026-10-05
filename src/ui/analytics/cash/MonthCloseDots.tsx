import type { CashRow, MonthCloseStatus } from '../../../engine'
import { firstCountedMonth, monthCloseStatus, shortMonthLabel } from '../../../engine'
import styles from './cash.module.css'

const STATUS_GLYPH: Record<MonthCloseStatus, string> = {
  counted: '✓',
  drift: '!',
  ready: '●',
  waiting: '…',
  open: '◔',
  untracked: '–',
}

const STATUS_TITLE: Record<MonthCloseStatus, string> = {
  counted: 'counted',
  drift: 'drift found',
  ready: 'ready to count',
  waiting: 'waiting on a card statement',
  open: 'not ended yet',
  untracked: 'before counting began',
}

/** One dot per month: counted, drift found, ready, waiting on its statement, not ended yet, or from before counting began. */
export function MonthCloseDots({
  rows,
  selected,
  openMonth,
  onSelect,
}: {
  rows: CashRow[]
  selected: string
  /** The budget month under way; it shows as such until it closes. */
  openMonth?: string | undefined
  onSelect: (month: string) => void
}) {
  const countingStart = firstCountedMonth(rows)
  return (
    <div className={styles.dots} role="group" aria-label="Month close status">
      {rows.map((row) => {
        const status = monthCloseStatus(row, undefined, openMonth, countingStart)
        return (
          <button
            key={row.month}
            type="button"
            className={`${styles.dot} tapActive`}
            aria-pressed={row.month === selected}
            title={`${shortMonthLabel(row.month)}: ${STATUS_TITLE[status]}`}
            onClick={() => onSelect(row.month)}
          >
            <span className={`${styles.dotMark} ${styles[`dot_${status}`]}`} aria-hidden>
              {STATUS_GLYPH[status]}
            </span>
            <span className={styles.dotLabel}>{shortMonthLabel(row.month)}</span>
          </button>
        )
      })}
    </div>
  )
}
