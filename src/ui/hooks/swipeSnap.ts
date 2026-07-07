export const SWIPE_OPEN_RATIO = 0.3
export const SWIPE_FLING_PX_MS = 0.35
export const SWIPE_DRAG_THRESHOLD_PX = 8

/** Pick open (-revealPx) or closed (0) after touch end. velocityX: px/ms, negative = left. */
export function resolveSwipeSnap(
  current: number,
  revealPx: number,
  velocityX: number,
): number {
  if (velocityX < -SWIPE_FLING_PX_MS) return -revealPx
  if (velocityX > SWIPE_FLING_PX_MS) return 0
  const openThreshold = -revealPx * SWIPE_OPEN_RATIO
  return current < openThreshold ? -revealPx : 0
}

export function exceedsSwipeDragThreshold(dx: number): boolean {
  return Math.abs(dx) > SWIPE_DRAG_THRESHOLD_PX
}
