import { useEffect } from 'react'

/** Prevent the page behind a modal from scrolling (reliable on iOS PWA). */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const { style } = document.body
    const scrollY = window.scrollY
    const prev = {
      overflow: style.overflow,
      position: style.position,
      top: style.top,
      width: style.width,
    }
    style.overflow = 'hidden'
    style.position = 'fixed'
    style.top = `-${scrollY}px`
    style.width = '100%'
    return () => {
      style.overflow = prev.overflow
      style.position = prev.position
      style.top = prev.top
      style.width = prev.width
      window.scrollTo(0, scrollY)
    }
  }, [active])
}
