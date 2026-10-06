import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { flushSync } from 'react-dom'

export interface Size {
  width: number
  height: number
}

/**
 * The rendered size of an element, kept current as it resizes. `fallback` is what callers get
 * before the first measurement and wherever layout does not run (jsdom reports every element as 0
 * wide and tall), so server and test output stay deterministic. A side that measures 0 keeps its
 * last value.
 *
 * The height is only read when `track` is set, and then a resize is committed before the browser
 * paints. Without that, an element that is drawn from its size shows one frame of the old drawing
 * stretched to the new box, which is a flash when a neighbour appears or goes: a resize observer's
 * callback is not a layout effect, and React would otherwise paint first and render after.
 */
export function useElementSize(ref: RefObject<HTMLElement | null>, fallback: Size, track = false): Size {
  const [size, setSize] = useState(fallback)
  // What was last set, so a resize that changes nothing does not ask React for another render.
  const last = useRef(size)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => {
      const width = Math.round(el.clientWidth)
      const height = track ? Math.round(el.clientHeight) : 0
      const prev = last.current
      const next = { width: width > 0 ? width : prev.width, height: height > 0 ? height : prev.height }
      if (next.width === prev.width && next.height === prev.height) return
      last.current = next
      setSize(next)
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(track ? () => flushSync(read) : read)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, track])
  return size
}
