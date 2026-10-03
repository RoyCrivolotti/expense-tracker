import styles from '../goals.module.css'

export interface ChartKeyMarks {
  /** Check-in dots are drawn. */
  checkins: boolean
  /** A life event that brings money in is drawn. */
  lifeIn: boolean
  /** A life event that takes money out is drawn. */
  lifeOut: boolean
}

/**
 * What the marks on the chart mean, beside the legend that says what the lines are. A dot is a
 * check-in, a diamond a life event; each is listed only when it is on the chart, since a key
 * for something that is not there is noise.
 */
export function ChartKeys({ checkins, lifeIn, lifeOut }: ChartKeyMarks) {
  if (!checkins && !lifeIn && !lifeOut) return null
  return (
    <ul className={styles.chartKeys} aria-label="Marks on the chart">
      {checkins ? (
        <li>
          <span className={`${styles.keyMark} ${styles.keyCheckin}`} aria-hidden />
          Check-in (what was really there)
        </li>
      ) : null}
      {lifeIn ? (
        <li>
          <span className={`${styles.keyMark} ${styles.keyLifeIn}`} aria-hidden />
          Life event, money in
        </li>
      ) : null}
      {lifeOut ? (
        <li>
          <span className={`${styles.keyMark} ${styles.keyLifeOut}`} aria-hidden />
          Life event, money out
        </li>
      ) : null}
    </ul>
  )
}
