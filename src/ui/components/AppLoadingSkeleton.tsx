import styles from './AppLoadingSkeleton.module.css'

/**
 * Full-screen placeholder shown while the expense dataset loads. Mirrors the
 * dashboard layout (KPI grid + cards) so the first paint settles into content
 * without a layout shift, instead of a bare "Loading..." line.
 */
export function AppLoadingSkeleton({ label = 'Loading' }: { label?: string }) {
  return (
    <div className={styles.wrap} role="status" aria-live="polite" aria-busy="true">
      <span className={styles.srOnly}>{label}</span>
      <div className={styles.bar} aria-hidden />
      <div className={styles.kpiGrid} aria-hidden>
        <span className={styles.kpi} />
        <span className={styles.kpi} />
        <span className={styles.kpi} />
        <span className={styles.kpi} />
      </div>
      <div className={styles.card} aria-hidden />
      <div className={styles.cardTall} aria-hidden />
    </div>
  )
}
