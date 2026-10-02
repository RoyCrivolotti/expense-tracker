import { prefersReducedMotion } from '../../hooks/prefersReducedMotion'

/** Where a Goals view's own content starts: past the intro and glossary, which only Plan has. */
export const GOALS_CONTENT_ANCHOR_ID = 'goals-content-top'

/**
 * Bring the content of the Goals view that is now open to just under the sticky view row.
 *
 * Deferred a frame so it measures the view after React has rendered it: Plan has an intro
 * above its content and Progress and Assumptions do not, so the target moves with the view that
 * was opened. `smooth` is for a tap on the view already open, where nothing else changes on
 * screen; opening another view jumps, since its content has just been swapped in.
 */
export function scrollToGoalsContent(behavior: 'auto' | 'smooth'): void {
  const run = () => {
    // Not every environment has scrollIntoView (jsdom does not).
    document.getElementById(GOALS_CONTENT_ANCHOR_ID)?.scrollIntoView?.({
      behavior: prefersReducedMotion() ? 'auto' : behavior,
      block: 'start',
    })
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
  else run()
}
