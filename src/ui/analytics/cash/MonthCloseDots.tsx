import type { CashRow, MonthCloseStatus } from '../../../engine'
import { monthCloseStatus, shortMonthLabel } from '../../../engine'
import styles from './cash.module.css'

const STATUS_GLYPH: Record<MonthCloseStatus, string> = {
  counted: '✓',
  drift: '!',
  ready: '●',
  waiting: '…',
}

const STATUS_TITLE: Record<MonthCloseStatus, string> = {
  counted: 'counted',
  drift: 'drift found',
  ready: 'ready to count',
  waiting: 'waiting on a card statement',
}

/** One dot per month: counted, drift found, ready, or waiting on its statement. */
export function MonthCloseDots({
  rows,
  selected,
  onSelect,
}: {
  rows: CashRow[]
  selected: string
  onSelect: (month: string) => void
}) {
  return (
    <div className={styles.dots} role="group" aria-label="Month close status">
      {rows.map((row) => {
        const status = monthCloseStatus(row)
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
