import { useLayoutEffect, useState, type RefObject } from 'react'

interface Position {
  top: number
  left: number
}

const GAP = 4

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
      const vw = window.innerWidth
      const vh = window.innerHeight

      const spaceBelow = vh - tr.bottom - GAP
      const flipsAbove = spaceBelow < pr.height
      // Clamp to the viewport in both directions: flipping above a trigger that
      // is itself near the top would otherwise push the popover off-screen.
      const top = flipsAbove ? Math.max(8, tr.top - GAP - pr.height) : tr.bottom + GAP

      let left = tr.left
      if (left + pr.width > vw - 8) left = vw - 8 - pr.width
      if (left < 8) left = 8

      setPos({ top, left })
    }

    update()

    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [triggerRef, popoverRef])

  return pos
}
