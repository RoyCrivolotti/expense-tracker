import type { SeedSeriesOption } from '../actions'
import styles from './Review.module.css'

/**
 * Which of the monthly series a payment is, asked in the add form as the card asks it: side by side, none preferred.
 * Picking one opens the form again filled from it.
 */
export default function SeriesChoice({ options }: { options: readonly SeedSeriesOption[] }) {
  return (
    <div className={styles.series}>
      <p className={styles.seriesText}>Looks like one of your monthly payments. Which one?</p>
      <div className={styles.seriesChoices}>
        {options.map((o) => (
          <button
            key={o.seriesKey}
            type="button"
            className={styles.link}
            aria-label={`Fill in as ${o.label}`}
            onClick={o.pick}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
