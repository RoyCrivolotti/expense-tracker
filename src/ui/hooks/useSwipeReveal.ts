import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { resolveSwipeSnap } from './swipeSnap'

const ACTION_WIDTH_REM = 4.5

export function swipeRevealPx(actionCount: number): number {
  return actionCount * ACTION_WIDTH_REM * 16
}

function applyOffset(
  setOffset: Dispatch<SetStateAction<number>>,
  offsetRef: MutableRefObject<number>,
  value: number | ((current: number) => number),
) {
  setOffset((current) => {
    const next = typeof value === 'function' ? value(current) : value
    offsetRef.current = next
    return next
  })
}

/** Horizontal swipe-to-reveal for trailing row actions (e.g. copy, delete). */
export function useSwipeReveal(enabled: boolean, actionCount = 1) {
  const revealPx = swipeRevealPx(actionCount)
  const [offset, setOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const offsetRef = useRef(0)
  const startX = useRef(0)
  const startOffset = useRef(0)
  const startTime = useRef(0)
  const lastX = useRef(0)
  const lastTime = useRef(0)

  const reset = () => {
    setIsDragging(false)
    applyOffset(setOffset, offsetRef, 0)
  }

  const onTouchStart = (clientX: number) => {
    if (!enabled) return
    const now = performance.now()
    startX.current = clientX
    lastX.current = clientX
    startTime.current = now
    lastTime.current = now
    startOffset.current = offsetRef.current
    setIsDragging(true)
  }

  const onTouchMove = (clientX: number) => {
    if (!enabled) return
    lastX.current = clientX
    lastTime.current = performance.now()
    const dx = clientX - startX.current
    const next = Math.max(-revealPx, Math.min(0, startOffset.current + dx))
    applyOffset(setOffset, offsetRef, next)
  }

  const onTouchEnd = () => {
    if (!enabled) return
    setIsDragging(false)
    const elapsed = lastTime.current - startTime.current
    const velocityX = elapsed > 0 ? (lastX.current - startX.current) / elapsed : 0
    applyOffset(setOffset, offsetRef, (current) =>
      resolveSwipeSnap(current, revealPx, velocityX),
    )
  }

  return { offset, isDragging, reset, onTouchStart, onTouchMove, onTouchEnd, revealPx }
}
