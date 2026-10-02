import { prefersReducedMotion } from '../../hooks/prefersReducedMotion'
import { showAdjustSections, type AdjustSection } from './adjustSections'

/** Where a Goals view's own content starts: past the intro and glossary, which only Plan has. */
export const GOALS_CONTENT_ANCHOR_ID = 'goals-content-top'

/** The sticky row of Goals views on a phone, which is what stays pinned in every view. */
export const GOALS_NAV_ID = 'goals-nav'

/** Run `run` once React has rendered what the viewer just did, and the browser has laid it out. */
function afterRender(run: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
  else run()
}

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
      behavior: prefersReducedMotion() ? 'auto' : behavior,
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
