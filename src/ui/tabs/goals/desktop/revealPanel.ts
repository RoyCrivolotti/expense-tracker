import { afterRender, scrollBehavior } from '../../../hooks/scrollTiming'
import { PINNED_AIR_PX, stickyBottom } from '../../../hooks/stickyScroll'

/** The bar the panel opens under (LeversBar). */
const BAR = '[data-levers-bar]'

/**
 * How far down the page's visible area starts: the page's scroll padding, or the bottom of the
 * bar where it is stuck under the header, whichever is lower. The padding alone would do, but it
 * is lifted while focus is inside the bar (useBarScrollPadding), and the button that opens the
 * panel is in the bar.
 */
function coveredTop(): number {
  const padding = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
  const bar = document.querySelector<HTMLElement>(BAR)
  const stuck = bar !== null && getComputedStyle(bar).position === 'sticky'
  return Math.max(padding, bar !== null && stuck ? stickyBottom(bar) + PINNED_AIR_PX : 0)
}

/**
 * Brings the inputs panel into view once it has opened, when it opened somewhere it cannot be
 * seen: below the middle of the screen, or up under the header and the bar. Where the bar is held
 * to the bottom edge, its place in the page, and so the panel's, is usually below the fold, and a
 * panel that opens out of sight makes the button look like it does nothing. One that opened
 * higher is left where it is, since the page should not move under someone who scrolled to it.
 */
export function revealPanel(id: string): void {
  afterRender(() => {
    const panel = document.getElementById(id)
    if (!panel) return
    const covered = coveredTop()
    const { top } = panel.getBoundingClientRect()
    if (top >= covered && top < window.innerHeight / 2) return
    // Scrolled by the distance rather than into view: scrollIntoView aligns to the page's scroll
    // padding, which is not where the bar ends while focus is in it. Not every environment has
    // scrollBy (jsdom's logs that it does not).
    window.scrollBy?.({ top: top - covered, behavior: scrollBehavior('smooth') })
  })
}
