import { exceedsSwipeDragThreshold, SWIPE_FLING_PX_MS } from './swipeSnap'

/** Fraction of the sheet's own height that must be dragged away to dismiss it. */
export const DISMISS_RATIO = 0.25
/** Cap on that distance, so a tall sheet doesn't demand a long drag. */
export const DISMISS_MAX_PX = 120

export function dismissThresholdPx(sheetHeight: number): number {
  if (sheetHeight <= 0) return DISMISS_MAX_PX
  return Math.min(sheetHeight * DISMISS_RATIO, DISMISS_MAX_PX)
}

/**
 * Dismiss or settle back after a downward drag on a sheet. `velocityY` is px/ms,
 * positive = downward. Shares `SWIPE_FLING_PX_MS` with the row swipe so a flick
 * means the same speed everywhere in the app.
 */
export function resolveDismissSnap(
  offsetY: number,
  sheetHeight: number,
  velocityY: number,
): 'dismiss' | 'settle' {
  // A flick that never really moved is a tap with a shaky finger, not a dismissal.
  if (!exceedsSwipeDragThreshold(offsetY)) return 'settle'
  if (velocityY < -SWIPE_FLING_PX_MS) return 'settle'
  if (velocityY > SWIPE_FLING_PX_MS) return 'dismiss'
  return offsetY >= dismissThresholdPx(sheetHeight) ? 'dismiss' : 'settle'
}
