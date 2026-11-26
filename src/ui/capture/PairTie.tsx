import styles from './ReviewList.module.css'

/**
 * The heading over two waiting payments that may be one bill: the bank's announcement and the charge it then reported.
 * It is a guess, so it only warns. The button removes the announcement and leaves the charge to be reviewed; without
 * write access there is no button and the sentence says what to do.
 */
export function PairTie({ amount, onDismiss }: { amount: string; onDismiss?: (() => void) | undefined }) {
  return (
    <div className={styles.tieHead}>
      <p>
        <b>Is this a duplicate?</b>
        {onDismiss ? null : "If it's duplicated, add only one."}
      </p>
      {onDismiss ? (
        <button
          type="button"
          className={styles.pill}
          aria-label={`Dismiss duplicate: the notice, ${amount}`}
          onClick={onDismiss}
        >
          <span className={`${styles.face} ${styles.outline}`}>Dismiss duplicate</span>
        </button>
      ) : null}
    </div>
  )
}
