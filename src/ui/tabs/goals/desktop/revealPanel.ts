import { afterRender, scrollBehavior } from '../../../hooks/scrollTiming'

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
    // The page's scroll padding is what the header and a stuck bar cover (useBarScrollPadding).
    const covered = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
    const { top } = panel.getBoundingClientRect()
    if (top >= covered && top < window.innerHeight / 2) return
    // Not every environment has scrollIntoView (jsdom does not).
    panel.scrollIntoView?.({ behavior: scrollBehavior('smooth'), block: 'start' })
  })
}
