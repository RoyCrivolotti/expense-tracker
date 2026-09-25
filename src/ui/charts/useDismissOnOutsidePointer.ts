import { useEffect, type RefObject } from 'react'

/** A finger that travels further than this between down and up is scrolling, not tapping. */
const TAP_SLOP_PX = 8

/**
 * Calls `onDismiss` on a tap or click outside `containerRef` (and `excludeRef`). A pointer
 * that comes down outside and then moves is a scroll, and scrolling the page to see what
 * the tap opened must not close it: on a phone the docked tooltip sits under the chart,
 * often below the fold.
 */
export function useDismissOnOutsidePointer(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
  excludeRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!active) return
    let down: { id: number; x: number; y: number } | null = null
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (containerRef.current?.contains(target)) return
      if (excludeRef?.current?.contains(target)) return
      down = { id: e.pointerId, x: e.clientX, y: e.clientY }
    }
    const onPointerUp = (e: PointerEvent) => {
      if (!down || down.id !== e.pointerId) return
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
      down = null
      if (moved <= TAP_SLOP_PX) onDismiss()
    }
    const onPointerCancel = () => {
      down = null
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('pointerup', onPointerUp, true)
    document.addEventListener('pointercancel', onPointerCancel, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('pointerup', onPointerUp, true)
      document.removeEventListener('pointercancel', onPointerCancel, true)
    }
  }, [active, containerRef, onDismiss, excludeRef])
}
