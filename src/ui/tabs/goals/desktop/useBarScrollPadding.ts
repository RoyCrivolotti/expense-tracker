import { useEffect, type RefObject } from 'react'
import { trackScrollPadding } from '../../../hooks/scrollPadding'
import { PINNED_AIR_PX, stickyBottom } from '../../../hooks/stickyScroll'

/** The air between the bar and the bottom edge of the screen while it is held there (planDesktop.module.css). */
const BOTTOM_AIR_PX = 12

/**
 * The bottom padding as a custom property, for the bar's own controls to take back out of their
 * scroll margin (planDesktop.module.css): Chromium scrolls to uncover a focused control before it
 * says it has focus, which is too early for the lift below to help.
 */
const BOTTOM_PADDING_VAR = '--scroll-pad-bottom'

/** Whether the stylesheet has the bar stuck under the header (it does from 75rem wide). */
function isSticky(bar: HTMLElement | null): bar is HTMLElement {
  return bar !== null && getComputedStyle(bar).position === 'sticky'
}

/**
 * Keeps a control that takes focus from the keyboard out from behind the bar, wherever the bar
 * is: under the header once the page has scrolled past it, or, where it is held to the bottom
 * edge (the stylesheet says where), along the bottom while its place in the page is still below
 * the fold. The page's padding covers it at the top while the bar is mounted and stuck, and at
 * the bottom only where it can be there. A wide screen has no bottom bar of its own, so there is
 * no padding at the bottom to replace.
 *
 * Where the bar is not stuck (narrower than 75rem, where it goes by with the page) nothing
 * covers the top but the header, which the app's own padding already clears, so the top is left to it.
 *
 * While focus is inside the bar the padding is lifted. The bar's own controls sit in the strip the
 * padding keeps clear, so Safari took each Tab or Enter on one as a control hidden behind the bar
 * and scrolled the page by the bar's height to uncover it (it does not honour a negative
 * scroll-margin on the control instead). It is put back as focus leaves, before the next control
 * is scrolled to.
 */
export function useBarScrollPadding(bar: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    let stopTop: (() => void) | null = null
    let focusInside = false
    const syncTop = () => {
      const sticky = isSticky(bar.current) && !focusInside
      if (sticky && stopTop === null) {
        stopTop = trackScrollPadding({
          top: () => (bar.current ? stickyBottom(bar.current) : 0) + PINNED_AIR_PX,
          watch: () => [bar.current],
        })
      } else if (!sticky && stopTop !== null) {
        stopTop()
        stopTop = null
      }
    }
    const root = document.documentElement
    const before = root.style.scrollPaddingBottom
    const apply = () => {
      syncTop()
      const el = bar.current
      const held = el !== null && getComputedStyle(el).bottom !== 'auto' ? `${el.offsetHeight + BOTTOM_AIR_PX + PINNED_AIR_PX}px` : null
      root.style.scrollPaddingBottom = held !== null && !focusInside ? held : before
      if (held !== null) root.style.setProperty(BOTTOM_PADDING_VAR, held)
      else root.style.removeProperty(BOTTOM_PADDING_VAR)
    }
    apply()
    const element = bar.current
    const enter = () => {
      focusInside = true
      apply()
    }
    const leave = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node && element?.contains(event.relatedTarget)) return
      focusInside = false
      apply()
    }
    element?.addEventListener('focusin', enter)
    element?.addEventListener('focusout', leave)
    window.addEventListener('resize', apply)
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(apply) : null
    if (bar.current) observer?.observe(bar.current)
    return () => {
      stopTop?.()
      element?.removeEventListener('focusin', enter)
      element?.removeEventListener('focusout', leave)
      window.removeEventListener('resize', apply)
      observer?.disconnect()
      root.style.scrollPaddingBottom = before
      root.style.removeProperty(BOTTOM_PADDING_VAR)
    }
  }, [bar])
}
