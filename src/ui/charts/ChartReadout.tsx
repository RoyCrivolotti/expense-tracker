import { DockedTooltip, TooltipBody } from './ChartTooltip'
import { isDetail, RESTING_NOTE, type ReadoutTip } from './readoutTips'
import styles from './charts.module.css'

/**
 * On a phone the tooltip is a panel above the chart, always there: it reads the last point
 * until another is tapped. It sits above because a panel below the chart is off-screen for a
 * chart at the bottom of the page. It exists before the first tap and is sized to its tallest
 * state because a panel that appeared, or changed height, would move the chart under the
 * finger.
 */
export function ChartReadout({
  tip,
  tallest,
  note,
  pinned,
}: {
  tip: ReadoutTip
  tallest: ReadoutTip
  /** A point is tapped: keep the panel under the app header while its chart is on screen. */
  pinned: boolean
  /** A hint beside the title: how to read another point, or that this one has more to read. */
  note?: string | undefined
}) {
  return (
    <div className={`${styles.tooltipDocked} ${styles.readout}${pinned ? ` ${styles.readoutPinned}` : ''}`} role="status">
      {/* The tallest state, unseen, so the panel is as tall as it will ever be. */}
      <div className={styles.readoutSizer} aria-hidden>
        <TooltipBody title={tallest.title} lines={tallest.lines} note={RESTING_NOTE} />
      </div>
      <div className={styles.readoutLive} data-readout="live">
        <TooltipBody title={tip.title} lines={tip.lines} note={note} />
      </div>
    </div>
  )
}

/**
 * The detail lines of a tapped point (the purchase breakdown), under the chart. There are too
 * many to hold a panel above the chart still, and they belong to one point, so they move what
 * is below the chart without moving the chart. They do not scroll into view: a page that moves
 * while a finger is dragging along the chart moves the chart with it.
 */
export function ChartReadoutDetail({ tip }: { tip: ReadoutTip }) {
  const lines = tip.lines.filter(isDetail)
  return lines.length > 0 ? <DockedTooltip title={tip.title} lines={lines} scroll={false} /> : null
}
