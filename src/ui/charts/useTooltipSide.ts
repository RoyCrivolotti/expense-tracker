import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

export type TooltipSide = 'above' | 'below'

// The app's own bars cover the ends of the screen: the header, and on a phone the tab bar. A
// chart sitting against one of them has no room on that side, however far the page goes.
const HEADER_HEIGHT = 'calc(3.8rem + env(safe-area-inset-top, 0px))'
const TAB_BAR_HEIGHT = 'calc(var(--exp-bottom-bar, 4rem) + env(safe-area-inset-bottom, 0px))'

/** The gap the panel keeps from the chart (`.tooltipAbove` / `.tooltipBelow`), which its height does not include. */
const PANEL_GAP = 6

/** How much less the other side must cut off, in pixels, before a panel that no longer fits swaps to it. */
const FLIP_MARGIN = 24

/** A CSS length in pixels, by laying it out: env() read back from a custom property is unreliable. */
function lengthPx(css: string): number {
  const probe = document.createElement('div')
  probe.style.cssText = `position:fixed;top:0;visibility:hidden;pointer-events:none;height:${css}`
  document.body.appendChild(probe)
  const px = probe.getBoundingClientRect().height
  probe.remove()
  return px
}

/** How much of the screen each bar covers. Laid out to measure, so kept while nothing resizes. */
export interface Bars {
  header: number
  tabBar: number
}

export function measureBars(): Bars {
  return { header: lengthPx(HEADER_HEIGHT), tabBar: lengthPx(TAB_BAR_HEIGHT) }
}

/** The part of the screen the app's bars leave free, in client coordinates. */
export function visibleBand(bars: Bars = measureBars()): { top: number; bottom: number } {
  // The visual viewport moves with the toolbar and a pinch, so it is read fresh every time.
  const vv = window.visualViewport
  const offsetTop = vv?.offsetTop ?? 0
  return {
    top: offsetTop + bars.header,
    bottom: offsetTop + (vv?.height ?? window.innerHeight) - bars.tabBar,
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

/** How much of a panel of height `need` a side would cut off. */
function clipped(room: number, need: number): number {
  return Math.max(0, need - room)
}

/**
 * The side a panel of height `need` should be on, given the side it is on now. A panel that
 * still fits stays where it is. One that no longer fits moves to the other side, but only if
 * that is clearly better, so it does not swap back and forth as the page moves through the
 * middle. When neither side has room the panel is cut off somewhere: the top counts double,
 * since that is where the title is, so a chart in the middle of a short screen gets its panel
 * below it with its last rows under the tab bar, not its title under the header. With no side
 * yet, the one that cuts less, and the one with more room when they cut the same.
 */
export function chooseSide(
  current: TooltipSide | null,
  room: { above: number; below: number },
  need: number,
): TooltipSide {
  const cost = { above: clipped(room.above, need) * 2, below: clipped(room.below, need) }
  if (current === null) {
    if (cost.above === cost.below) return pickSide(room)
    return cost.above < cost.below ? 'above' : 'below'
  }
  const other: TooltipSide = current === 'above' ? 'below' : 'above'
  return cost[other] + FLIP_MARGIN < cost[current] ? other : current
}

/** Works the side out from where the chart is now, and reports it only when it changes. */
function settleSide(
  chart: RefObject<HTMLElement | null> | undefined,
  panel: RefObject<HTMLElement | null>,
  held: { current: TooltipSide | null },
  bars: { current: Bars | null },
  setSide: (side: TooltipSide) => void,
) {
  const box = chart?.current
  const el = panel.current
  if (!box || !el) return
  bars.current ??= measureBars()
  const room = roomAround(box.getBoundingClientRect(), visibleBand(bars.current))
  const next = chooseSide(held.current, room, el.offsetHeight + PANEL_GAP)
  if (next === held.current) return
  held.current = next
  setSide(next)
}

/**
 * Which side of its chart a phone tooltip is on. It is worked out from where the chart is now,
 * not once when the tooltip opened: a page that scrolls under an open tooltip moves the room
 * from one side to the other, and a side that was right a screen ago can leave the panel under
 * the header. The panel itself sits on the chart's edge by CSS and moves with it, so nothing is
 * stored about where it is; only the side can change, and only when the current one runs out.
 */
export function useTooltipSide(
  chart: RefObject<HTMLElement | null> | undefined,
  panel: RefObject<HTMLElement | null>,
  content: string,
): TooltipSide {
  const [side, setSide] = useState<TooltipSide>('above')
  const held = useRef<TooltipSide | null>(null)
  const bars = useRef<Bars | null>(null)
  // Before paint, so the panel is never seen on the wrong side first, and again when what it
  // shows changes, since that changes its height.
  useLayoutEffect(() => {
    void content
    settleSide(chart, panel, held, bars, setSide)
  }, [chart, panel, content])
  useEffect(() => {
    // A frame at most: the room changes as the page moves, and reading it once per frame is
    // cheap, where a state update per scroll event would not be.
    let frame = 0
    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        settleSide(chart, panel, held, bars, setSide)
      })
    }
    // A rotation or the browser's toolbar can change the bars, so they are measured again.
    const resized = () => {
      bars.current = null
      schedule()
    }
    const vv = window.visualViewport
    window.addEventListener('scroll', schedule, { capture: true, passive: true })
    window.addEventListener('resize', resized)
    vv?.addEventListener('resize', resized)
    vv?.addEventListener('scroll', schedule)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', resized)
      vv?.removeEventListener('resize', resized)
      vv?.removeEventListener('scroll', schedule)
    }
  }, [chart, panel])
  return side
}
