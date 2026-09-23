import { useLayoutEffect, useState, type RefObject } from 'react'

/**
 * The rendered width of an element, kept current as it resizes. `fallback` is what
 * callers get before the first measurement and wherever layout does not run (jsdom
 * reports every element as 0 wide), so server and test output stay deterministic.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback: number): number {
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => {
      const w = Math.round(el.clientWidth)
      if (w > 0) setWidth(w)
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(read)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return width
}
