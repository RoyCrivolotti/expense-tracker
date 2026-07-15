import { useEffect, useRef, type RefObject } from 'react'

const THRESHOLD_PX = 72
const MAX_PULL_PX = 96

interface Options {
  onRefresh: () => void
  enabled?: boolean
}

/** Pull-to-refresh on the main scroll container (mobile). */
export function usePullToRefresh(
  containerRef: RefObject<HTMLElement | null>,
  { onRefresh, enabled = true }: Options,
): void {
  const startY = useRef(0)
  const pulling = useRef(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el || !enabled) return

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop > 0) return
      const touch = e.touches[0]
      if (!touch) return
      startY.current = touch.clientY
      pulling.current = true
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (!pulling.current) return
      pulling.current = false
      const touch = e.changedTouches[0]
      if (!touch || el.scrollTop > 0) return
      if (touch.clientY - startY.current >= THRESHOLD_PX) onRefresh()
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [containerRef, enabled, onRefresh])
}

export { MAX_PULL_PX, THRESHOLD_PX }
