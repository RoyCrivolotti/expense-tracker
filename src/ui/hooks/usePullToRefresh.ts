import { useEffect, useRef, useState } from 'react'
import { isBodyScrollLocked } from './useBodyScrollLock'
import { jxOn } from '../debug/jitterFlags'

const THRESHOLD_PX = 112
const MAX_PULL_PX = 140
const SCROLL_TOP_EPS = 2

interface Options {
  onRefresh: () => void
  enabled?: boolean
  refreshing?: boolean
}

/**
 * Whether the page sits at the top — but only meaningful when the page can scroll at
 * all, which is why every caller below pairs it with `isBodyScrollLocked()`.
 */
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
      // Without the lock check the at-top gate is permanently satisfied while a sheet
      // is open — `useBodyScrollLock` pins `body`, so `scrollY` reads 0 wherever the
      // page really is — and every touch inside the sheet arms a pull. Scrolling the
      // transaction form refreshed the whole app. `touch-action` on the overlay is no
      // help: it suppresses the browser's own panning, not delivery of touches to
      // these listeners. There is nothing to refresh either way, since the page behind
      // a sheet is pinned and out of reach.
      if (jxOn('pullOff') || isBodyScrollLocked() || scrollTop() > SCROLL_TOP_EPS) return
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
      // Re-checked rather than trusted from touchstart: a sheet can open mid-drag (a
      // row action, a confirm), and releasing then must not land a refresh.
      if (isBodyScrollLocked()) return
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
