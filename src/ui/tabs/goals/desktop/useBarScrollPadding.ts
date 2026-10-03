import { useEffect, type RefObject } from 'react'
import { trackScrollPadding } from '../../../hooks/scrollPadding'
import { PINNED_AIR_PX, stickyBottom } from '../../../hooks/stickyScroll'

/** The air between the bar and the bottom edge of the screen while it is held there (planDesktop.module.css). */
const BOTTOM_AIR_PX = 12

/**
 * Keeps a control that takes focus from the keyboard out from behind the bar, wherever the bar
 * is: under the header once the page has scrolled past it, or, where it is held to the bottom
 * edge (the stylesheet says where), along the bottom while its place in the page is still below
 * the fold. The page's padding covers it at the top while the bar is mounted, and at the bottom
 * only where it can be there. A wide screen has no bottom bar of its own, so there is no padding
 * at the bottom to replace.
 */
export function useBarScrollPadding(bar: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const stopTop = trackScrollPadding({
      top: () => (bar.current ? stickyBottom(bar.current) : 0) + PINNED_AIR_PX,
      watch: () => [bar.current],
    })
    const root = document.documentElement
    const before = root.style.scrollPaddingBottom
    const apply = () => {
      const el = bar.current
      const heldAtBottom = el !== null && getComputedStyle(el).bottom !== 'auto'
      root.style.scrollPaddingBottom = heldAtBottom
        ? `${el.offsetHeight + BOTTOM_AIR_PX + PINNED_AIR_PX}px`
        : before
    }
    apply()
    window.addEventListener('resize', apply)
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(apply) : null
    if (bar.current) observer?.observe(bar.current)
    return () => {
      stopTop()
      window.removeEventListener('resize', apply)
      observer?.disconnect()
      root.style.scrollPaddingBottom = before
    }
  }, [bar])
}
