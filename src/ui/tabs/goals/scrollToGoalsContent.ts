import { restoreScroll, scrollToAnchor } from '../../hooks/stickyScroll'
import { showAdjustSections, type AdjustSection } from './adjustSections'
import { GOALS_CONTENT_ANCHOR_ID } from './goalsAnchors'

/**
 * Bring the content of the Goals view that is now open to just under the sticky view row.
 *
 * Deferred a frame so it measures the view after React has rendered it: the views are not the
 * same height, so what the page can scroll to depends on the one that was opened. `smooth` is
 * for a tap on the view already open, where nothing else changes on screen; opening another view
 * jumps, since its content has just been swapped in.
 */
export function scrollToGoalsContent(behavior: 'auto' | 'smooth'): void {
  scrollToAnchor(GOALS_CONTENT_ANCHOR_ID, behavior)
}

/**
 * Put the page back where it was, once the view it was left on has been rendered again.
 * Adjust's sections fold themselves when its controls are unmounted, and an offset only means
 * something on the page it was taken from, so `open` brings back the ones that were showing.
 */
export function restoreScrollPosition(top: number, open: readonly AdjustSection[] | null = null): void {
  restoreScroll(top, open ? () => showAdjustSections(open) : undefined)
}
