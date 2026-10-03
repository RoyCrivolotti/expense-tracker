import { useEffect, type RefObject } from 'react'
import { trackScrollPadding } from '../../../hooks/scrollPadding'
import { PINNED_AIR_PX, stickyBottom } from '../../../hooks/stickyScroll'

/** The air between the bar and the bottom edge of the screen while it is held there (planDesktop.module.css). */
const BOTTOM_AIR_PX = 12

/**
 * Keeps a control that takes focus from the keyboard out from behind the bar, wherever the bar
 * is: under the header once the page has scrolled past it, or along the bottom edge while its
 * place in the page is still below the fold. The page's padding covers it at the top, and at
 * the bottom while the bar is mounted. A wide screen has no bottom bar of its own, so there is
 * no padding there to replace.
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
      const height = bar.current?.offsetHeight ?? 0
      root.style.scrollPaddingBottom = `${height + BOTTOM_AIR_PX + PINNED_AIR_PX}px`
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
