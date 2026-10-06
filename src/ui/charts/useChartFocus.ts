import { useCallback, useRef, useState, type RefObject } from 'react'
import { quarterTurnX } from './chartPointer'
import { useDismissOnOutsidePointer } from './useDismissOnOutsidePointer'

/** The index whose x is nearest, or null when the nearest is further than `reach`. */
export function nearestIndex(
  x: number,
  length: number,
  xForIndex: (i: number) => number,
  reach = Infinity,
): number | null {
  let best: number | null = null
  let bestDist = Infinity
  for (let i = 0; i < length; i++) {
    const d = Math.abs(x - xForIndex(i))
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return bestDist <= reach ? best : null
}

export interface ChartFocusOptions {
  /**
   * Keep the focused index until another is picked: leaving the chart, losing focus, tapping
   * elsewhere, Escape and a hover out of reach do not clear it. For a surface that is all chart
   * and its readout, where a value that vanishes when a finger lifts is the wrong thing.
   */
  sticky?: boolean | undefined
  /** The index focused at the start. */
  initial?: number | null | undefined
  /** 1 when the chart is drawn a quarter turn clockwise by an ancestor's transform. */
  turn?: 0 | 1 | undefined
}

/**
 * Hover (desktop), tap (touch) or arrow keys (keyboard) focus on the nearest chart index.
 * `containerRef` is the chart's wrapper: a tap outside it clears the focus.
 */
export function useChartFocus(
  length: number,
  xForIndex: (i: number) => number,
  containerRef: RefObject<HTMLElement | null>,
  options: ChartFocusOptions = {},
) {
  const { sticky = false, initial = null, turn = 0 } = options
  const [stored, setActive] = useState<number | null>(initial)
  // A sticky index outlives the data it pointed into: a shorter window shows its last step, and
  // the stored one comes back when the window grows again.
  const active = sticky && stored != null && length > 0 ? Math.min(stored, length - 1) : stored
  // A finger sliding along the chart, from pointer down to up. Between two steps it is
  // still on the chart, so the nearest step stays rather than the tooltip blinking out.
  const dragging = useRef(false)

  const dismiss = useCallback(() => {
    if (!sticky) setActive(null)
  }, [sticky])

  useDismissOnOutsidePointer(containerRef, active != null && !sticky, dismiss)

  const pick = useCallback(
    (clientX: number, clientY: number, svg: SVGSVGElement, anywhere: boolean) => {
      if (length === 0) return
      const x = plotX(svg, clientX, clientY, turn)
      if (x === null) return
      // A hover reaches 28 CSS pixels either side, whatever the viewBox is scaled to.
      const scale = svg.viewBox.baseVal.width / svg.clientWidth
      const next = nearestIndex(x, length, xForIndex, anywhere ? Infinity : 28 * scale)
      if (next !== null || !sticky) setActive(next)
    },
    [length, xForIndex, turn, sticky],
  )

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    pick(e.clientX, e.clientY, e.currentTarget, dragging.current)
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== 'mouse') e.preventDefault()
    dragging.current = true
    pick(e.clientX, e.clientY, e.currentTarget, true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerUp = () => {
    dragging.current = false
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

  return {
    active,
    onPointerMove,
    onPointerDown,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onPointerLeave,
    onKeyDown,
    onBlur: dismiss,
  }
}

/** The pointer's x in viewBox units, or null when the svg has no screen matrix or box to read. */
function plotX(svg: SVGSVGElement, clientX: number, clientY: number, turn: 0 | 1): number | null {
  if (turn === 1) return quarterTurnX(clientY, svg.getBoundingClientRect(), svg.viewBox.baseVal.width)
  const ctm = svg.getScreenCTM()
  if (!ctm) return null
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  return pt.matrixTransform(ctm.inverse()).x
}

/** Everything the hook returns except `active`: spread onto the svg. */
export type ChartFocusHandlers = Omit<ReturnType<typeof useChartFocus>, 'active'>
