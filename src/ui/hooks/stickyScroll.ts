import { afterRender, scrollBehavior } from './scrollTiming'

/** Air between what is pinned and the top edge of whatever is scrolled to under it. */
export const PINNED_AIR_PX = 8

/** A sticky element's `top`, as the browser resolved it (safe-area inset included). */
function stickyTop(el: HTMLElement): number {
  return Number.parseFloat(getComputedStyle(el).top) || 0
}

/**
 * Where the bottom edge of a sticky element sits once it is stuck. Its `top` is read rather than
 * rebuilt from the tokens that make it up, and its height is measured, so neither is written
 * down a second time.
 */
export function stickyBottom(el: HTMLElement): number {
  return stickyTop(el) + el.offsetHeight
}

/**
 * Whether a sticky element has been carried down to the place it sticks. One still lower than
 * that has nothing above it to scroll back to, so a tap near the top of the page must not nudge
 * it. The 0.5 is sub-pixel slack.
 */
export function isStuck(el: HTMLElement | null): boolean {
  return el !== null && el.getBoundingClientRect().top <= stickyTop(el) + 0.5
}

/**
 * Bring the element with this id to the top of the page, where its scroll margin and the page's
 * scroll padding say the top is. Deferred a frame so it measures the content after React has
 * rendered it. `smooth` is for a tap on what is already open, where nothing else changes on
 * screen; `auto` jumps, since the content has just been swapped in.
 */
export function scrollToAnchor(id: string, behavior: 'auto' | 'smooth'): void {
  afterRender(() => {
    const anchor = document.getElementById(id)
    if (!anchor) return
    // Not every environment has scrollIntoView (jsdom does not).
    anchor.scrollIntoView?.({
      behavior: scrollBehavior(behavior),
      block: 'start',
    })
  })
}

/**
 * Put the page back at `top` once what it was left on has been rendered again. `beforeScroll`
 * is for what the offset only means once restored, such as folded sections that must be open
 * again for the page to be as long as it was.
 */
export function restoreScroll(top: number, beforeScroll?: () => void): void {
  afterRender(() => {
    beforeScroll?.()
    window.scrollTo({ top, behavior: 'auto' })
  })
}
