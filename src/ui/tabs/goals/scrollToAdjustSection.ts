import { prefersReducedMotion } from '../../hooks/prefersReducedMotion'
import { adjustSectionId, type AdjustSection } from './adjustSections'
import { GOALS_NAV_ID } from './scrollToGoalsContent'

/** The block pinned under the view row in Adjust: the draft's chart and the section chips. */
export const ADJUST_STACK_ID = 'goals-adjust-stack'

/** Air between the pinned stack and the section's top edge when one is scrolled to. */
const GAP_PX = 8

/** Long enough for iOS's keyboard to arrive, and its own scroll to a focused field to follow. */
const KEYBOARD_SETTLE_MS = 400

/**
 * What covers the top of the page once it has scrolled: the stack in Adjust, which is only
 * pinned on a screen with room for it, and the view row otherwise.
 */
function pinnedElement(): HTMLElement | null {
  const stack = document.getElementById(ADJUST_STACK_ID)
  if (stack && getComputedStyle(stack).position === 'sticky') return stack
  return document.getElementById(GOALS_NAV_ID)
}

/**
 * Where the bottom edge of what is pinned sits once it is stuck. Its sticky `top` is read as
 * the browser resolved it (safe-area inset included) rather than rebuilt here, and its height
 * is measured, so neither is written down a second time. Zero when nothing is pinned.
 */
export function pinnedBottom(): number {
  const pinned = pinnedElement()
  if (!pinned) return 0
  return (Number.parseFloat(getComputedStyle(pinned).top) || 0) + pinned.offsetHeight
}

/** Scroll an Adjust section's heading to just under what is pinned, opening it first. */
export function scrollToAdjustSection(key: AdjustSection, behavior: 'auto' | 'smooth'): void {
  const section = document.getElementById(adjustSectionId(key))
  if (!section) return
  if (section instanceof HTMLDetailsElement) section.open = true
  window.scrollBy({
    top: section.getBoundingClientRect().top - pinnedBottom() - GAP_PX,
    behavior: prefersReducedMotion() ? 'auto' : behavior,
  })
}

/**
 * Open Adjust at its controls rather than at the cards above them, so the first thing on
 * screen under the pinned chart is a slider. Deferred a frame so the stack and the controls
 * have been rendered before they are measured.
 */
export function landOnAdjustControls(): void {
  const run = () => scrollToAdjustSection('portfolio', 'auto')
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
  else run()
}

/**
 * Nudge the page, if need be, so a field that has just taken focus is not behind the pinned
 * stack. The browser scrolls a focused field into view, but to the edge of what it counts as
 * visible, which does not know the stack covers the top of it; with the keyboard up, iOS does
 * it again once the keyboard has finished arriving, so the check runs twice. A field above the
 * stack, or already below it, is left where it is.
 */
export function keepClearOfStack(field: Element): void {
  const check = () => {
    const pinned = pinnedElement()?.getBoundingClientRect()
    if (!pinned) return
    const top = field.getBoundingClientRect().top
    if (top < pinned.top || top >= pinned.bottom) return
    window.scrollBy({ top: top - pinned.bottom - GAP_PX, behavior: 'auto' })
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(check)
  else check()
  setTimeout(check, KEYBOARD_SETTLE_MS)
}
