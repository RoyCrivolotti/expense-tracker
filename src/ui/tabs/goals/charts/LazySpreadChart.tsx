import { lazy, Suspense } from 'react'
import { ChartShell } from './ChartShell'
import type { SpreadChartProps } from './SpreadChart'
import styles from '../goals.module.css'

// Its own chunk: the replay and its draws are only needed when the card is on the page, and the page opens
// without waiting for them.
const SpreadChart = lazy(() => import('./SpreadChart').then((m) => ({ default: m.SpreadChart })))

/** The spread card, loaded when it is first shown. */
export function LazySpreadChart(props: SpreadChartProps) {
  return (
    <Suspense
      fallback={
        <ChartShell embedded={props.embedded ?? false}>
          <h3 className={styles.chartTitle}>How far luck could move the plan</h3>
          <p className={styles.chartHint}>Working it out…</p>
        </ChartShell>
      }
    >
      <SpreadChart {...props} />
    </Suspense>
  )
}
