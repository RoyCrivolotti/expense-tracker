import { afterRender, scrollBehavior } from '../../hooks/scrollTiming'
import { PINNED_AIR_PX, stickyBottom } from '../../hooks/stickyScroll'
import { adjustSectionId, type AdjustSection } from './adjustSections'
import { ADJUST_STACK_ID, GOALS_NAV_ID } from './goalsAnchors'

/** Air between what is pinned and the top edge of whatever is scrolled to under it. */
export const GAP_PX = PINNED_AIR_PX

/** Long enough for iOS's keyboard to arrive, and its own scroll to a focused field to follow. */
const KEYBOARD_SETTLE_MS = 400

/** The viewer taking the scrolling over, after which a nudge from here would fight them. */
const VIEWER_SCROLL_EVENTS = ['wheel', 'touchstart'] as const

/** Puts away the delayed check of the field that last took focus: its timer and its listeners. */
let endSettleCheck: (() => void) | undefined

/**
 * What covers the top of the page once it has scrolled: the stack in Adjust, which is only
 * pinned on a screen with room for it, and the view row otherwise.
 */
function pinnedElement(): HTMLElement | null {
  const stack = document.getElementById(ADJUST_STACK_ID)
  if (stack && getComputedStyle(stack).position === 'sticky') return stack
  return document.getElementById(GOALS_NAV_ID)
}

/** Where the bottom edge of what is pinned sits once it is stuck; zero when nothing is pinned. */
export function pinnedBottom(): number {
  const pinned = pinnedElement()
  return pinned ? stickyBottom(pinned) : 0
}

/** Scroll an Adjust section's heading to just under what is pinned, opening it first. */
export function scrollToAdjustSection(key: AdjustSection, behavior: 'auto' | 'smooth'): void {
  const section = document.getElementById(adjustSectionId(key))
  if (!section) return
  if (section instanceof HTMLDetailsElement) section.open = true
  window.scrollBy({
    top: section.getBoundingClientRect().top - pinnedBottom() - GAP_PX,
    behavior: scrollBehavior(behavior),
  })
}

/**
 * Open Adjust at its controls rather than at the cards above them, so the first thing on
 * screen under the pinned chart is a slider. Deferred a frame so the stack and the controls
 * have been rendered before they are measured.
 */
export function landOnAdjustControls(): void {
  afterRender(() => scrollToAdjustSection('portfolio', 'auto'))
}

/**
 * Nudge the page, if need be, so a field that has just taken focus is not behind what is
 * pinned. The browser scrolls a focused field into view, but to the edge of what it counts as
 * visible, which does not know the stack covers the top of it; with the keyboard up, iOS does
 * it again once the keyboard has finished arriving, so the check runs twice. A field above the
 * stack, or already below it, is left where it is.
 *
 * The second check is only for a field that still has focus and a page the viewer has not
 * scrolled since: otherwise it would pull the page back from where they have taken it.
 */
export function keepClearOfStack(field: Element): void {
  endSettleCheck?.()
  const check = () => {
    const pinned = pinnedElement()?.getBoundingClientRect()
    if (!pinned) return
    const top = field.getBoundingClientRect().top
    if (top < pinned.top || top >= pinned.bottom) return
    window.scrollBy({ top: top - pinned.bottom - GAP_PX, behavior: 'auto' })
  }
  afterRender(check)

  let viewerScrolled = false
  const onViewerScroll = () => {
    viewerScrolled = true
  }
  for (const type of VIEWER_SCROLL_EVENTS) window.addEventListener(type, onViewerScroll, { passive: true })
  const timer = setTimeout(() => {
    if (!viewerScrolled && document.activeElement === field) check()
    endSettleCheck?.()
  }, KEYBOARD_SETTLE_MS)
  endSettleCheck = () => {
    clearTimeout(timer)
    for (const type of VIEWER_SCROLL_EVENTS) window.removeEventListener(type, onViewerScroll)
    endSettleCheck = undefined
  }
}
