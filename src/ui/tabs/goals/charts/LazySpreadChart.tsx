import { lazy, Suspense, useState } from 'react'
import { ChunkBoundary } from '../../../components/ChunkBoundary'
import { ChartShell } from './ChartShell'
import type { SpreadChartProps } from './SpreadChart'
import styles from '../goals.module.css'

// Its own chunk: the replay and its draws are only needed when the card is on the page, and the page opens
// without waiting for them.
const SpreadChart = lazy(() => import('./SpreadChart').then((m) => ({ default: m.SpreadChart })))

/**
 * The spread card, loaded when it is first near the screen. If its code does not load, only the card says so: it
 * is fetched on its own, after the page, so a failure there must not take the rest of the page with it.
 */
export function LazySpreadChart(props: SpreadChartProps) {
  const embedded = props.embedded ?? false
  // A card that starts far from the screen does not even fetch its code until it has been near once.
  const [seen, setSeen] = useState(!props.paused)
  if (!props.paused && !seen) setSeen(true)
  const waiting = (
    <ChartShell embedded={embedded}>
      <h3 className={styles.chartTitle}>How far luck could move the plan</h3>
      <p className={styles.chartHint}>Working it out…</p>
    </ChartShell>
  )
  if (!seen) return waiting
  return (
    <ChunkBoundary
      fallback={
        <ChartShell embedded={embedded}>
          <h3 className={styles.chartTitle}>How far luck could move the plan</h3>
          <p role="status" className={styles.chartHint}>
            This card could not be shown. Reload the page to try again.
          </p>
          <button type="button" className={styles.matrixToggle} onClick={() => window.location.reload()}>
            Reload
          </button>
        </ChartShell>
      }
    >
      <Suspense fallback={waiting}>
        <SpreadChart {...props} />
      </Suspense>
    </ChunkBoundary>
  )
}
