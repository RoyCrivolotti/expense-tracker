import { useEffect, useRef, useState } from 'react'

const THRESHOLD_PX = 72
const MAX_PULL_PX = 96
const SCROLL_TOP_EPS = 2

interface Options {
  onRefresh: () => void
  enabled?: boolean
  refreshing?: boolean
}

function scrollTop(): number {
  if (typeof window === 'undefined') return 0
  return window.scrollY || document.documentElement.scrollTop || 0
}

/** Pull-to-refresh when the document is scrolled to the top (mobile). */
export function usePullToRefresh({
  onRefresh,
  enabled = true,
  refreshing = false,
}: Options): { pullPx: number; isPulling: boolean } {
  const startY = useRef(0)
  const pullDistance = useRef(0)
  const pulling = useRef(false)
  const [pullPx, setPullPx] = useState(0)
  const [isPulling, setIsPulling] = useState(false)

  useEffect(() => {
    if (!enabled || refreshing) return

    const reset = () => {
      pulling.current = false
      pullDistance.current = 0
      setPullPx(0)
      setIsPulling(false)
    }

    const onTouchStart = (e: TouchEvent) => {
      if (scrollTop() > SCROLL_TOP_EPS) return
      const touch = e.touches[0]
      if (!touch) return
      startY.current = touch.clientY
      pulling.current = true
      setIsPulling(true)
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current) return
      if (scrollTop() > SCROLL_TOP_EPS) {
        reset()
        return
      }
      const touch = e.touches[0]
      if (!touch) return
      const delta = touch.clientY - startY.current
      if (delta <= 0) {
        pullDistance.current = 0
        setPullPx(0)
        return
      }
      const next = Math.min(delta, MAX_PULL_PX)
      pullDistance.current = next
      setPullPx(next)
    }

    const onTouchEnd = () => {
      if (!pulling.current) return
      const distance = pullDistance.current
      reset()
      if (distance >= THRESHOLD_PX && scrollTop() <= SCROLL_TOP_EPS) onRefresh()
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', reset, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', reset)
    }
  }, [enabled, refreshing, onRefresh])

  return { pullPx: refreshing ? 0 : pullPx, isPulling: refreshing ? false : isPulling }
}

export { MAX_PULL_PX, THRESHOLD_PX }
