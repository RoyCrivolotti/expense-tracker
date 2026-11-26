import { useMoneyFormat } from '../hooks/moneyFormatContext'
import type { WaitingTotals } from '../../domain/capture/totals'
import { totalChips } from './reviewFormat'
import styles from './ReviewList.module.css'

/**
 * The card's one line: how many payments wait and what they add up to, money in and money out. It is the button that
 * folds and opens the card.
 */
export function ReviewHeader({
  count,
  totals,
  open,
  controls,
  onOpen,
}: {
  count: number
  totals: WaitingTotals | null
  open: boolean
  controls: string
  onOpen: (open: boolean) => void
}) {
  const format = useMoneyFormat()
  return (
    <h2 className={styles.heading}>
      <button
        type="button"
        className={styles.strip}
        aria-expanded={open}
        aria-controls={controls}
        onClick={() => onOpen(!open)}
      >
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.count}>{count} to review</span>
        <span className={styles.totals}>
          {(totals ? totalChips(totals, format) : []).map((chip) => (
            <span key={chip.way} className={`${styles.total} ${styles[chip.way]}`}>
              {chip.text} <span className={styles.srOnly}>{chip.spoken}</span>
            </span>
          ))}
        </span>
        <svg className={styles.chevron} width="14" height="14" viewBox="0 0 10 10" aria-hidden="true">
          <path
            d="M2 3.5 5 6.5 8 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </h2>
  )
}
