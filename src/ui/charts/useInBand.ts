import { useLayoutEffect, useState, type RefObject } from 'react'
import { visibleBand } from './useTooltipSide'

/** Slack for an intersection ratio that should read 1 and comes back as 0.9999. */
const RATIO_SLACK = 0.01

interface Options {
  /** False observes nothing and answers false. */
  enabled?: boolean
  /** The answer where there is no IntersectionObserver (jsdom): a caller that hides things on a false wants true here. */
  fallback?: boolean
}

/** The share of a box inside the band, from its own geometry: the answer before the observer's first report. */
function shareInBand(el: Element): number {
  const box = el.getBoundingClientRect()
  const band = visibleBand()
  const height = box.bottom - box.top
  return height > 0 ? Math.max(0, Math.min(box.bottom, band.bottom) - Math.max(box.top, band.top)) / height : 0
}

/**
 * Whether at least `min` of an element (1 is all of it) is inside the part of the screen the
 * app's own bars leave free. Observed rather than measured on scroll: the callback fires when
 * the element crosses `min`, not on every frame, and reading it costs no layout. It is measured
 * once as the element is first watched, since the observer's first report comes a frame late and
 * that frame would show the wrong thing.
 */
export function useInBand(
  target: RefObject<Element | null> | undefined,
  min: number,
  { enabled = true, fallback = false }: Options = {},
): boolean {
  const [inBand, setInBand] = useState(false)
  const observable = typeof IntersectionObserver !== 'undefined'
  useLayoutEffect(() => {
    const el = target?.current
    if (!enabled || !el || !observable) return undefined
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInBand(shareInBand(el) >= min - RATIO_SLACK)
    const observe = () => {
      const band = visibleBand()
      const io = new IntersectionObserver(
        ([entry]) => setInBand(entry !== undefined && entry.intersectionRatio >= min - RATIO_SLACK),
        {
          // The bars cover the ends of the viewport, so the band is the viewport shrunk by them.
          rootMargin: `-${Math.round(band.top)}px 0px -${Math.max(0, Math.round(window.innerHeight - band.bottom))}px 0px`,
          // The observer reports when the ratio crosses one of these. The slack is counted as in
          // band, so it must be a threshold too, or a ratio that landed just under `min` would
          // be counted in band and never reported again as it fell away.
          threshold: [min - RATIO_SLACK, min],
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
  }, [target, min, enabled, observable])
  if (!enabled) return false
  return observable ? inBand : fallback
}
