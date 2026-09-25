import { useLayoutEffect, useState, type RefObject } from 'react'

export type TooltipSide = 'above' | 'below'

// The app's own bars cover the ends of the screen: the header, and on a phone the tab bar. A
// chart sitting against one of them has no room on that side, however far the page goes.
const HEADER_HEIGHT = 'calc(3.8rem + env(safe-area-inset-top, 0px))'
const TAB_BAR_HEIGHT = 'calc(var(--exp-bottom-bar, 4rem) + env(safe-area-inset-bottom, 0px))'

/** A CSS length in pixels, by laying it out: env() read back from a custom property is unreliable. */
function lengthPx(css: string): number {
  const probe = document.createElement('div')
  probe.style.cssText = `position:fixed;top:0;visibility:hidden;pointer-events:none;height:${css}`
  document.body.appendChild(probe)
  const px = probe.getBoundingClientRect().height
  probe.remove()
  return px
}

/** The room above and below a box, in the part of the screen the app's bars leave free. */
export function roomAround(box: { top: number; bottom: number }): { above: number; below: number } {
  const vv = window.visualViewport
  const offsetTop = vv?.offsetTop ?? 0
  const bandTop = offsetTop + lengthPx(HEADER_HEIGHT)
  const bandBottom = offsetTop + (vv?.height ?? window.innerHeight) - lengthPx(TAB_BAR_HEIGHT)
  return { above: box.top - bandTop, below: bandBottom - box.bottom }
}

/** The side with more room; above when they are equal, which keeps a thumb off the panel. */
export function pickSide(room: { above: number; below: number }): TooltipSide {
  return room.above >= room.below ? 'above' : 'below'
}

/**
 * Which side of the chart its tooltip opens on on a phone: the one with more room. It is
 * decided as the tooltip opens and held until it closes, so the panel does not jump from one
 * side to the other while a finger slides along the chart, or as the page settles under it.
 */
export function useTooltipSide(open: boolean, chart: RefObject<HTMLElement | null>): TooltipSide {
  const [side, setSide] = useState<TooltipSide>('above')
  useLayoutEffect(() => {
    if (!open || !chart.current) return
    // The room can only be measured after layout; setting it here, before paint, means the
    // tooltip is never seen on the wrong side first.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSide(pickSide(roomAround(chart.current.getBoundingClientRect())))
  }, [open, chart])
  return side
}
