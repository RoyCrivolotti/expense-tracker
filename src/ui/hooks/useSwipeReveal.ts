import { useRef, useState } from 'react'

const ACTION_WIDTH_REM = 4.5

export function swipeRevealPx(actionCount: number): number {
  return actionCount * ACTION_WIDTH_REM * 16
}

/** Horizontal swipe-to-reveal for trailing row actions (e.g. copy, delete). */
export function useSwipeReveal(enabled: boolean, actionCount = 1) {
  const revealPx = swipeRevealPx(actionCount)
  const [offset, setOffset] = useState(0)
  const startX = useRef(0)
  const startOffset = useRef(0)

  const reset = () => setOffset(0)

  const onTouchStart = (clientX: number) => {
    if (!enabled) return
    startX.current = clientX
    startOffset.current = offset
  }

  const onTouchMove = (clientX: number) => {
    if (!enabled) return
    const dx = clientX - startX.current
    const next = Math.max(-revealPx, Math.min(0, startOffset.current + dx))
    setOffset(next)
  }

  const onTouchEnd = () => {
    if (!enabled) return
    setOffset((current) => (current < -revealPx / 2 ? -revealPx : 0))
  }

  return { offset, reset, onTouchStart, onTouchMove, onTouchEnd, revealPx }
}
