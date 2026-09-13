import { exceedsSwipeDragThreshold, SWIPE_FLING_PX_MS } from './swipeSnap'

/** Fraction of the sheet's own height that must be dragged away to dismiss it. */
export const DISMISS_RATIO = 0.25
/** Cap on that distance, so a tall sheet doesn't demand a long drag. */
export const DISMISS_MAX_PX = 120
/**
 * How far a flick must travel before speed alone can dismiss. The 8px that means
 * "this is a drag, not a tap" is far too little for a sheet: a twitch while reaching
 * for a field would throw away a half-typed form.
 */
export const FLICK_MIN_PX = 45
/**
 * Reversing upward by this much cancels the dismissal outright, wherever the sheet
 * has got to. Pulling back is the gesture people make when they change their mind, so
 * it wins over everything else — the cost of settling when a dismissal was wanted is
 * one more swipe, and the cost of the reverse is a lost draft.
 */
export const CANCEL_PULLBACK_PX = 40
/**
 * Velocity is read from the tail of the gesture rather than its whole length.
 * Averaging start-to-end made a slow drag ending in a flick read as slow and — worse
 * — a drag that had been quick but was *parked* before release read as fast, so a
 * sheet deliberately held below the threshold still flew away.
 */
export const VELOCITY_WINDOW_MS = 100

export interface DragSample {
  /** Touch position in client coordinates. */
  y: number
  /** `performance.now()` when it was taken. */
  t: number
}

export function dismissThresholdPx(sheetHeight: number): number {
  if (sheetHeight <= 0) return DISMISS_MAX_PX
  return Math.min(sheetHeight * DISMISS_RATIO, DISMISS_MAX_PX)
}

/** px/ms across the last `VELOCITY_WINDOW_MS` of a drag; positive = downward. */
export function recentVelocity(samples: readonly DragSample[]): number {
  const last = samples[samples.length - 1]
  if (!last || samples.length < 2) return 0
  const first = samples.find((s) => last.t - s.t <= VELOCITY_WINDOW_MS) ?? samples[0]
  if (!first) return 0
  const dt = last.t - first.t
  return dt > 0 ? (last.y - first.y) / dt : 0
}

export interface DismissRelease {
  /** Where the sheet sits when the finger lifts. */
  offsetY: number
  /** The furthest it got during this drag, for detecting a pull back up. */
  peakOffsetY: number
  sheetHeight: number
  /** px/ms from `recentVelocity`. */
  velocityY: number
}

/**
 * Dismiss the sheet, or settle it back where it started.
 *
 * Ordered so that the two ways of saying "no" are checked before either way of
 * saying "yes": a person who reverses course should always get the sheet back,
 * whatever the distance says.
 */
export function resolveDismissSnap({
  offsetY,
  peakOffsetY,
  sheetHeight,
  velocityY,
}: DismissRelease): 'dismiss' | 'settle' {
  if (!exceedsSwipeDragThreshold(offsetY)) return 'settle'
  if (velocityY < -SWIPE_FLING_PX_MS) return 'settle'
  if (peakOffsetY - offsetY >= CANCEL_PULLBACK_PX) return 'settle'
  if (offsetY >= dismissThresholdPx(sheetHeight)) return 'dismiss'
  return velocityY > SWIPE_FLING_PX_MS && offsetY >= FLICK_MIN_PX ? 'dismiss' : 'settle'
}
