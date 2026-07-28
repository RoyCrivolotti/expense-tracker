import { useEffect, useRef, useState } from 'react'

const HIDE_TIMEOUT_MS = 250

/**
 * True when idle, false while the page is actively scrolling. The floating
 * action button is fixed-position and sits directly on top of list rows on
 * narrow (mobile) viewports as they scroll past — hiding it during scroll
 * avoids that overlap without permanently reserving screen space for it.
 */
export function useAutoHideFab(enabled: boolean): boolean {
  const [visible, setVisible] = useState(true)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) return

    const handleScroll = () => {
      setVisible(false)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setVisible(true), HIDE_TIMEOUT_MS)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [enabled])

  return enabled ? visible : true
}
