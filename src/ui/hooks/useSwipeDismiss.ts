import { useEffect, useRef, useState, type RefObject } from 'react'
import { recentVelocity, resolveDismissSnap, type DragSample } from './sheetDismissSnap'

/**
 * Marks a region of the sheet that always starts a dismissal — the grab handle and
 * the header. Applied as an attribute rather than matched on a class name, which
 * CSS modules hash.
 */
export const SHEET_GRAB_ATTR = 'data-sheet-grab'

/** Spread onto whichever parts of a sheet should always start a dismissal. */
export const sheetGrabProps = { [SHEET_GRAB_ATTR]: '' } as const

/** Enough recent positions to cover the velocity window at any sane frame rate. */
const MAX_SAMPLES = 12

export interface SwipeDismissState {
  /** How far the sheet has been dragged down, in px. */
  offset: number
  /** True while a finger is down, so the caller can drop its transition. */
  isDragging: boolean
  /** `offset` as a fraction of the sheet's height, for fading the scrim behind it. */
  progress: number
}

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
 * `onDismiss` is handed the offset the sheet was released at, so the caller can carry
 * the motion on from where the finger left it rather than restarting from rest.
 */
export function useSwipeDismiss(
  sheetRef: RefObject<HTMLElement | null>,
  onDismiss: (fromOffsetPx: number) => void,
  enabled = true,
): SwipeDismissState {
  const [offset, setOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [progress, setProgress] = useState(0)

  const armed = useRef(false)
  const startY = useRef(0)
  const peak = useRef(0)
  const height = useRef(0)
  const samples = useRef<DragSample[]>([])
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
      setProgress(height.current > 0 ? Math.min(1, next / height.current) : 0)
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
      peak.current = 0
      // Measured once per gesture: the sheet's height cannot change mid-drag, and
      // reading it on every move would mean a layout flush per frame.
      height.current = sheet.offsetHeight
      samples.current = [{ y: touch.clientY, t: performance.now() }]
      setIsDragging(true)
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!armed.current) return
      const touch = e.touches[0]
      if (!touch) return
      samples.current.push({ y: touch.clientY, t: performance.now() })
      if (samples.current.length > MAX_SAMPLES) samples.current.shift()

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
      peak.current = Math.max(peak.current, dy)
      apply(dy)
    }

    const onTouchEnd = () => {
      if (!armed.current) return
      const verdict = resolveDismissSnap({
        offsetY: offsetRef.current,
        peakOffsetY: peak.current,
        sheetHeight: height.current,
        velocityY: recentVelocity(samples.current),
      })
      if (verdict === 'settle') {
        stop()
        return
      }
      // Deliberately *not* reset to 0 first. The sheet stays where the finger left
      // it so the caller's exit animation can continue that same movement; snapping
      // home and vanishing in one frame is what made this feel abrupt.
      armed.current = false
      setIsDragging(false)
      dismissRef.current(offsetRef.current)
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

  return { offset, isDragging, progress }
}
