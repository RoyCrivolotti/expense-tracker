import { useEffect, useState, type RefObject } from 'react'
import { visibleBand } from './useTooltipSide'

/** Slack for an intersection ratio that should read 1 and comes back as 0.9999. */
const RATIO_SLACK = 0.01

/**
 * Whether at least `min` of an element (1 is all of it) is inside the part of the screen the
 * app's own bars leave free. Observed rather than measured on scroll: the callback fires when
 * the element crosses `min`, not on every frame, and reading it costs no layout. Where
 * IntersectionObserver is missing (jsdom) it is false.
 */
export function useInBand(target: RefObject<Element | null>, min: number, enabled = true): boolean {
  const [inBand, setInBand] = useState(false)
  useEffect(() => {
    const el = target.current
    if (!enabled || !el || typeof IntersectionObserver === 'undefined') return undefined
    const observe = () => {
      const band = visibleBand()
      const io = new IntersectionObserver(
        ([entry]) => setInBand(entry !== undefined && entry.intersectionRatio >= min - RATIO_SLACK),
        {
          // The bars cover the ends of the viewport, so the band is the viewport shrunk by them.
          rootMargin: `-${Math.round(band.top)}px 0px -${Math.max(0, Math.round(window.innerHeight - band.bottom))}px 0px`,
          threshold: [min],
        },
      )
      io.observe(el)
      return io
    }
    let io = observe()
    // A rotation or the browser's toolbar moves the band, and the margin is fixed at creation.
    const remake = () => {
      io.disconnect()
      io = observe()
    }
    const vv = window.visualViewport
    vv?.addEventListener('resize', remake)
    window.addEventListener('resize', remake)
    return () => {
      io.disconnect()
      vv?.removeEventListener('resize', remake)
      window.removeEventListener('resize', remake)
    }
  }, [target, min, enabled])
  return enabled && inBand
}
