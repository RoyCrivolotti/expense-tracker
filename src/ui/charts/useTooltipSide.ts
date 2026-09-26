import { useLayoutEffect, useState, type RefObject } from 'react'
import { useDockedTooltip } from './useDockedTooltip'

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

/** The part of the screen the app's bars leave free, in client coordinates. */
export function visibleBand(): { top: number; bottom: number } {
  const vv = window.visualViewport
  const offsetTop = vv?.offsetTop ?? 0
  return {
    top: offsetTop + lengthPx(HEADER_HEIGHT),
    bottom: offsetTop + (vv?.height ?? window.innerHeight) - lengthPx(TAB_BAR_HEIGHT),
  }
}

/** The room above and below a box, inside the free band. */
export function roomAround(
  box: { top: number; bottom: number },
  band = visibleBand(),
): { above: number; below: number } {
  return { above: box.top - band.top, below: band.bottom - box.bottom }
}

/** The side with more room; above when they are equal, which keeps a thumb off the panel. */
export function pickSide(room: { above: number; below: number }): TooltipSide {
  return room.above >= room.below ? 'above' : 'below'
}

/**
 * How far to move a panel, in pixels down, to sit inside the band: up when it hangs below it,
 * down when it pokes above it. A panel taller than the band keeps its top, since that is the
 * title.
 */
export function nudgeIntoBand(box: { top: number; bottom: number }, band: { top: number; bottom: number }): number {
  const up = Math.min(0, band.bottom - box.bottom)
  return box.top + up < band.top ? band.top - box.top : up
}

interface TooltipSideOptions {
  /** False for a chart that shows no tooltip: nothing is measured. */
  enabled?: boolean
  /** An element that already shows the tapped point's values. While it is fully on screen the tooltip stays away, so it never covers what it repeats. */
  unlessVisible?: RefObject<HTMLElement | null> | undefined
}

/**
 * Which side of the chart its tooltip opens on, and whether it opens at all: the side with
 * more room, decided as the tooltip opens and held until it closes, so the panel does not jump
 * from one side to the other while a finger slides along the chart, or as the page settles
 * under it. Only measured where it matters: on a phone, or when there is an element to defer to.
 */
export function useTooltipSide(
  open: boolean,
  chart: RefObject<HTMLElement | null>,
  { enabled = true, unlessVisible }: TooltipSideOptions = {},
): { side: TooltipSide; show: boolean } {
  const docked = useDockedTooltip()
  const [decision, setDecision] = useState<{ side: TooltipSide; covered: boolean }>({ side: 'above', covered: false })
  useLayoutEffect(() => {
    if (!open || !enabled || !chart.current || !(docked || unlessVisible)) return
    const band = visibleBand()
    const shown = unlessVisible?.current?.getBoundingClientRect()
    // The room can only be measured after layout; setting it here, before paint, means the
    // tooltip is never seen on the wrong side first.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDecision({
      side: pickSide(roomAround(chart.current.getBoundingClientRect(), band)),
      covered: shown !== undefined && shown.top >= band.top && shown.bottom <= band.bottom,
    })
  }, [open, enabled, chart, docked, unlessVisible])
  return { side: decision.side, show: enabled && !decision.covered }
}
