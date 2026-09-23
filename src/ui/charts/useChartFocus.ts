import { useCallback, useState, type RefObject } from 'react'
import { useDismissOnOutsidePointer } from './useDismissOnOutsidePointer'

/**
 * Hover (desktop), tap (touch) or arrow keys (keyboard) focus on the nearest chart index.
 * `containerRef` is the chart's wrapper: a pointer down outside it clears the focus.
 */
export function useChartFocus(
  length: number,
  xForIndex: (i: number) => number,
  containerRef: RefObject<HTMLElement | null>,
) {
  const [active, setActive] = useState<number | null>(null)

  const dismiss = useCallback(() => setActive(null), [])

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
      // 28 CSS pixels either side, whatever the viewBox is scaled to.
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
    pick(e.clientX, e.currentTarget)
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== 'mouse') e.preventDefault()
    pick(e.clientX, e.currentTarget)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerLeave = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== 'mouse') return
    dismiss()
  }

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (length === 0) return
    const last = length - 1
    const step = (next: number) => {
      e.preventDefault()
      setActive(Math.max(0, Math.min(last, next)))
    }
    switch (e.key) {
      case 'ArrowRight':
        step((active ?? -1) + 1)
        break
      case 'ArrowLeft':
        step((active ?? length) - 1)
        break
      case 'Home':
        step(0)
        break
      case 'End':
        step(last)
        break
      case 'Escape':
        dismiss()
        break
      default:
        break
    }
  }

  return { active, onPointerMove, onPointerDown, onPointerLeave, onKeyDown, onBlur: dismiss }
}

/** Everything the hook returns except `active`: spread onto the svg. */
export type ChartFocusHandlers = Omit<ReturnType<typeof useChartFocus>, 'active'>
