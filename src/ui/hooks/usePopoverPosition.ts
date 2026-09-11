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
      const top =
        spaceBelow >= pr.height
          ? tr.bottom + GAP + window.scrollY
          : tr.top - GAP - pr.height + window.scrollY

      let left = tr.left + window.scrollX
      if (left + pr.width > vw - 8) left = vw - 8 - pr.width + window.scrollX
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
