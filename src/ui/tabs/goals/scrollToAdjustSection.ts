import { prefersReducedMotion } from '../../hooks/prefersReducedMotion'
import { adjustSectionId, type AdjustSection } from './adjustSections'

/** The block pinned under the view row in Adjust: the draft's chart and the section chips. */
export const ADJUST_STACK_ID = 'goals-adjust-stack'

/** Air between the pinned stack and the section's top edge when one is scrolled to. */
const GAP_PX = 8

/**
 * Where the pinned stack's bottom edge sits once it is stuck. Its sticky `top` is read as the
 * browser resolved it (safe-area inset included) rather than rebuilt here, and its height is
 * measured, so neither is written down a second time. Zero when there is no stack.
 */
export function stackBottom(): number {
  const stack = document.getElementById(ADJUST_STACK_ID)
  if (!stack) return 0
  return (Number.parseFloat(getComputedStyle(stack).top) || 0) + stack.offsetHeight
}

/** Scroll an Adjust section's heading to just under the pinned stack, opening it first. */
export function scrollToAdjustSection(key: AdjustSection, behavior: 'auto' | 'smooth'): void {
  const section = document.getElementById(adjustSectionId(key))
  if (!section) return
  if (section instanceof HTMLDetailsElement) section.open = true
  window.scrollBy({
    top: section.getBoundingClientRect().top - stackBottom() - GAP_PX,
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
