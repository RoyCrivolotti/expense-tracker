import { afterRender, scrollBehavior } from '../../hooks/scrollTiming'
import { showAdjustSections, type AdjustSection } from './adjustSections'
import { GOALS_CONTENT_ANCHOR_ID } from './goalsAnchors'

/**
 * Bring the content of the Goals view that is now open to just under the sticky view row.
 *
 * Deferred a frame so it measures the view after React has rendered it: Plan has an intro
 * above its content and Progress and Assumptions do not, so the target moves with the view that
 * was opened. `smooth` is for a tap on the view already open, where nothing else changes on
 * screen; opening another view jumps, since its content has just been swapped in.
 */
export function scrollToGoalsContent(behavior: 'auto' | 'smooth'): void {
  afterRender(() => {
    const anchor = document.getElementById(GOALS_CONTENT_ANCHOR_ID)
    if (!anchor) return
    // Not every environment has scrollIntoView (jsdom does not).
    anchor.scrollIntoView?.({
      behavior: scrollBehavior(behavior),
      block: 'start',
    })
  })
}

/**
 * Put the page back where it was, once the view it was left on has been rendered again.
 * Adjust's sections fold themselves when its controls are unmounted, and an offset only means
 * something on the page it was taken from, so `open` brings back the ones that were showing.
 */
export function restoreScrollPosition(top: number, open: readonly AdjustSection[] | null = null): void {
  afterRender(() => {
    if (open) showAdjustSections(open)
    window.scrollTo({ top, behavior: 'auto' })
  })
}
