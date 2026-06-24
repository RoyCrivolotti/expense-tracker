import { useCallback, useRef, useState } from 'react'
import { useDismissOnOutsidePointer } from './useDismissOnOutsidePointer'

/** How long a tap-pinned tooltip stays visible before auto-dismiss. */
export const PINNED_TOOLTIP_MS = 5600

/** Hover (desktop) or tap/hold (touch) focus on the nearest chart index. */
export function useChartFocus(length: number, xForIndex: (i: number) => number) {
  const [active, setActive] = useState<number | null>(null)
  const containerRef = useRef<HTMLElement>(null)
  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTouchTimer = useCallback(() => {
    if (touchTimer.current) {
      clearTimeout(touchTimer.current)
      touchTimer.current = null
    }
  }, [])

  const dismiss = useCallback(() => {
    clearTouchTimer()
    setActive(null)
  }, [clearTouchTimer])

  useDismissOnOutsidePointer(containerRef, active != null, dismiss)

  const pick = useCallback(
    (clientX: number, svg: SVGSVGElement) => {
      if (length === 0) return
      const ctm = svg.getScreenCTM()
      if (!ctm) return
      const pt = svg.createSVGPoint()
      pt.x = clientX
      pt.y = 0
      const { x } = pt.matrixTransform(ctm.inverse())
      const scale = svg.viewBox.baseVal.width / svg.clientWidth
      const snap = 28 * scale
      let best = 0
      let bestDist = Infinity
      for (let i = 0; i < length; i++) {
        const d = Math.abs(x - xForIndex(i))
        if (d < bestDist) {
          bestDist = d
          best = i
        }
      }
      setActive(bestDist <= snap ? best : null)
    },
    [length, xForIndex],
  )

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    clearTouchTimer()
    pick(e.clientX, e.currentTarget)
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    clearTouchTimer()
    pick(e.clientX, e.currentTarget)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse') return
    clearTouchTimer()
    touchTimer.current = setTimeout(dismiss, PINNED_TOOLTIP_MS)
  }

  const onPointerLeave = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== 'mouse') return
    dismiss()
  }

  return { active, containerRef, onPointerMove, onPointerDown, onPointerUp, onPointerLeave }
}
