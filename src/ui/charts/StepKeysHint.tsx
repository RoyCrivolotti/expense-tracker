import styles from './charts.module.css'

/** Said to a screen reader as the description of a chart that takes focus; nothing on the chart says it. */
export function StepKeysHint({ id, show }: { id: string; show: boolean }) {
  if (!show) return null
  return (
    <span id={id} className={styles.srOnly}>
      Use the left and right arrow keys to step through the years, Home and End to go to the first and last, and Escape to clear.
    </span>
  )
}
