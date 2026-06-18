import { useRef, useState } from 'react'

const REVEAL_PX = 4.5 * 16 // matches delete action width in CSS (4.5rem)

/** Horizontal swipe-to-reveal for a trailing action (e.g. delete). */
export function useSwipeReveal(enabled: boolean) {
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
    const next = Math.max(-REVEAL_PX, Math.min(0, startOffset.current + dx))
    setOffset(next)
  }

  const onTouchEnd = () => {
    if (!enabled) return
    setOffset(offset < -REVEAL_PX / 2 ? -REVEAL_PX : 0)
  }

  return { offset, reset, onTouchStart, onTouchMove, onTouchEnd, revealPx: REVEAL_PX }
}
