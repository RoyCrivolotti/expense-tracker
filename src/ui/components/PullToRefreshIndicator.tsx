import { THRESHOLD_PX } from '../hooks/usePullToRefresh'
import { RefreshIcon } from '../icons'
import styles from './PullToRefreshIndicator.module.css'

interface Props {
  pullPx: number
  isPulling: boolean
  refreshing: boolean
}

/** How tall the strip is: the pull, damped, while a finger is down; a fixed spinner row while refreshing. */
function stripHeight(visible: boolean, refreshing: boolean, pullPx: number): number {
  if (!visible) return 0
  return refreshing ? 40 : Math.max(pullPx * 0.45, 0)
}

export function PullToRefreshIndicator({ pullPx, isPulling, refreshing }: Props) {
  const visible = refreshing || (isPulling && pullPx > 8)
  const ready = pullPx >= THRESHOLD_PX
  const progress = refreshing ? 1 : Math.min(pullPx / THRESHOLD_PX, 1)
  // Tracks the finger exactly while it is down, and only then: a transition would make the
  // strip trail the finger by its duration.
  const tracking = isPulling && !refreshing
  const classes = [styles.wrap, (ready || refreshing) && styles.ready, tracking && styles.tracking]

  return (
    <div
      className={classes.filter(Boolean).join(' ')}
      // Never unmounted, so it can ease closed: deleting it would drop the page under it by
      // the strip's height in one frame. At zero height it costs nothing, and the one
      // transition both opens and closes it.
      style={{ height: stripHeight(visible, refreshing, pullPx) }}
      aria-hidden
    >
      <span
        className={`${styles.icon} ${refreshing ? styles.spin : ''}`}
        style={refreshing ? undefined : { opacity: visible ? progress : 0, transform: `scale(${0.6 + progress * 0.4})` }}
      >
        <RefreshIcon />
      </span>
    </div>
  )
}
