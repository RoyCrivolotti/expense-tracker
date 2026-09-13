import { useLayoutEffect, useState, type RefObject } from 'react'

interface Position {
  top: number
  left: number
}

const GAP = 4
const EDGE = 8

/**
 * Top edge a flipped popover may not cross.
 *
 * `env()` is not readable from JS, so theme.css publishes it as
 * `--exp-safe-top` and this reads that back. Without it a flipped popover
 * clamps to 8px, which on a notched phone is underneath the clock.
 */
function safeTop(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--exp-safe-top')
  return EDGE + (Number.parseFloat(raw) || 0)
}

/**
 * Positions a portalled popover below (or above, if near viewport bottom) its
 * trigger element, left-aligned and clamped horizontally to the viewport.
 *
 * Returns **viewport** coordinates, so the popover must be `position: fixed`.
 * That is not a style detail — it is what makes this correct inside a Modal.
 * `useBodyScrollLock` pins the page with `position: fixed; top: -<scrollY>px`
 * on <body>, and a portalled `position: absolute` child is then offset by that
 * same amount, putting the popover hundreds of pixels off-screen whenever the
 * page was scrolled before the modal opened.
 *
 * Only call this hook while the popover is mounted — the popover components
 * render conditionally, so the hook runs only when needed.
 *
 * Repositions when the popover's own size changes, not just on resize and
 * scroll. A popover that grows after it opens — the flag picker revealing its
 * "new flag" input is the case that surfaced this — keeps the placement chosen
 * for its old height, so it either hangs off the bottom of the screen or, once
 * a keyboard shrinks the viewport, flips above and lands somewhere unrelated to
 * the field it belongs to.
 */
export function usePopoverPosition(
  triggerRef: RefObject<HTMLElement | null>,
  popoverRef: RefObject<HTMLElement | null>,
): Position | null {
  const [pos, setPos] = useState<Position | null>(null)

  useLayoutEffect(() => {
    const trigger = triggerRef.current
    const popover = popoverRef.current
    if (!trigger || !popover) return

    const update = () => {
      const t = triggerRef.current
      const p = popoverRef.current
      if (!t || !p) return

      const tr = t.getBoundingClientRect()
      const pr = p.getBoundingClientRect()
      // visualViewport tracks the *visible* area, so an on-screen keyboard
      // shrinks it. window.innerHeight does not move, which made every popover
      // near the bottom of a form think it had room it did not have.
      const vw = window.visualViewport?.width ?? window.innerWidth
      const vh = window.visualViewport?.height ?? window.innerHeight

      const spaceBelow = vh - tr.bottom - GAP
      const flipsAbove = spaceBelow < pr.height
      // Clamp to the viewport in both directions: flipping above a trigger that
      // is itself near the top would otherwise push the popover off-screen.
      const top = flipsAbove ? Math.max(safeTop(), tr.top - GAP - pr.height) : tr.bottom + GAP

      let left = tr.left
      if (left + pr.width > vw - 8) left = vw - 8 - pr.width
      if (left < 8) left = 8

      setPos({ top, left })
    }

    update()

    // The popover's own growth is the case window resize never hears about.
    const observer = new ResizeObserver(update)
    observer.observe(popover)

    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    // The keyboard opening resizes the visual viewport without firing a window
    // resize on iOS, so subscribe to it directly where it exists.
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [triggerRef, popoverRef])

  return pos
}
