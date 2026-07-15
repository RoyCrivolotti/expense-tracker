import { THRESHOLD_PX } from '../hooks/usePullToRefresh'
import { RefreshIcon } from '../icons'
import styles from './PullToRefreshIndicator.module.css'

interface Props {
  pullPx: number
  isPulling: boolean
  refreshing: boolean
}

export function PullToRefreshIndicator({ pullPx, isPulling, refreshing }: Props) {
  const visible = refreshing || (isPulling && pullPx > 8)
  if (!visible) return null

  const ready = pullPx >= THRESHOLD_PX
  const progress = refreshing ? 1 : Math.min(pullPx / THRESHOLD_PX, 1)

  return (
    <div
      className={`${styles.wrap} ${ready || refreshing ? styles.ready : ''}`}
      style={{ height: refreshing ? 40 : Math.max(pullPx * 0.45, 0) }}
      aria-hidden
    >
      <span
        className={`${styles.icon} ${refreshing ? styles.spin : ''}`}
        style={refreshing ? undefined : { opacity: progress, transform: `scale(${0.6 + progress * 0.4})` }}
      >
        <RefreshIcon />
      </span>
    </div>
  )
}
