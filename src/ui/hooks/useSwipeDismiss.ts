import { useEffect, useRef, useState, type RefObject } from 'react'
import { resolveDismissSnap } from './sheetDismissSnap'

/**
 * Marks a region of the sheet that always starts a dismissal — the grab handle and
 * the header. Applied as an attribute rather than matched on a class name, which
 * CSS modules hash.
 */
export const SHEET_GRAB_ATTR = 'data-sheet-grab'

/** Spread onto whichever parts of a sheet should always start a dismissal. */
export const sheetGrabProps = { [SHEET_GRAB_ATTR]: '' } as const

/**
 * Swipe a bottom sheet down to dismiss it.
 *
 * The hard part is telling a dismissal apart from a scroll, since both are a finger
 * moving down the same surface. The decision is made once, at `touchstart`, and
 * latched for the whole sequence — a gesture never changes meaning halfway through:
 *
 *  - started on the handle or header  → always a dismissal;
 *  - started in the body              → a dismissal only if the sheet is already
 *                                       scrolled to its top;
 *  - otherwise                        → a scroll, and this hook stays out of it.
 *
 * Returns the live offset so the caller can translate the sheet, and `isDragging` so
 * it can drop its transition while the finger is down.
 */
export function useSwipeDismiss(
  sheetRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  enabled = true,
): { offset: number; isDragging: boolean } {
  const [offset, setOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const armed = useRef(false)
  const startY = useRef(0)
  const lastY = useRef(0)
  const startTime = useRef(0)
  const lastTime = useRef(0)
  const offsetRef = useRef(0)

  // Kept in a ref so the listeners below can stay attached across renders: callers
  // pass a fresh closure every time (TransactionModal's guarded `modalOnClose`).
  const dismissRef = useRef(onDismiss)
  useEffect(() => {
    dismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    const sheet = sheetRef.current
    if (!enabled || !sheet) return

    const apply = (next: number) => {
      offsetRef.current = next
      setOffset(next)
    }

    const stop = () => {
      armed.current = false
      setIsDragging(false)
      apply(0)
    }

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (!touch) return
      const target = e.target instanceof Element ? e.target : null
      const onGrab = target?.closest(`[${SHEET_GRAB_ATTR}]`) != null
      armed.current = onGrab || sheet.scrollTop <= 0
      if (!armed.current) return
      startY.current = touch.clientY
      lastY.current = touch.clientY
      startTime.current = performance.now()
      lastTime.current = startTime.current
      setIsDragging(true)
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!armed.current) return
      const touch = e.touches[0]
      if (!touch) return
      lastY.current = touch.clientY
      lastTime.current = performance.now()
      const dy = touch.clientY - startY.current
      // Downward only. An upward drag is left to the browser so the body keeps
      // scrolling normally, which is also why this cannot be a passive listener:
      // without preventDefault the sheet translates while the page rubber-bands
      // underneath it.
      if (dy <= 0) {
        if (offsetRef.current !== 0) apply(0)
        return
      }
      e.preventDefault()
      apply(dy)
    }

    const onTouchEnd = () => {
      if (!armed.current) return
      const elapsed = lastTime.current - startTime.current
      const velocityY = elapsed > 0 ? (lastY.current - startY.current) / elapsed : 0
      const verdict = resolveDismissSnap(offsetRef.current, sheet.offsetHeight, velocityY)
      stop()
      // Settles back *before* dismissing rather than animating out: the close may be
      // refused (TransactionModal confirms an unsaved draft first), and a sheet that
      // had animated away would be left off-screen behind that confirm. When the
      // close does go through, the sheet unmounts and the spring-back is never seen.
      if (verdict === 'dismiss') dismissRef.current()
    }

    sheet.addEventListener('touchstart', onTouchStart, { passive: true })
    sheet.addEventListener('touchmove', onTouchMove, { passive: false })
    sheet.addEventListener('touchend', onTouchEnd, { passive: true })
    sheet.addEventListener('touchcancel', stop, { passive: true })
    return () => {
      sheet.removeEventListener('touchstart', onTouchStart)
      sheet.removeEventListener('touchmove', onTouchMove)
      sheet.removeEventListener('touchend', onTouchEnd)
      sheet.removeEventListener('touchcancel', stop)
    }
  }, [enabled, sheetRef])

  return { offset, isDragging }
}
