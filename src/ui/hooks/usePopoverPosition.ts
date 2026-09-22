import { useLayoutEffect, useState, type RefObject } from 'react'

export interface Position {
  top: number
  left: number
  /** Placed over its trigger rather than under it, so it can move away from the trigger it came from. */
  above: boolean
  /**
   * Cap for the popover's own height, so one taller than the visible band
   * scrolls inside itself instead of running off the screen. Depends only on
   * the viewport, never on the popover's measured height — deriving it from the
   * latter would feed the ResizeObserver its own output.
   */
  maxHeight: number
}

const GAP = 4
const EDGE = 8
const MIN_HEIGHT = 140

/*
 * Measures env(safe-area-inset-top) as a *used* value.
 *
 * A hidden element whose height *is* the inset can only report a used value,
 * sidestepping WebKit's unreliable env() resolution in custom properties. Created
 * once and left in the DOM for the page's lifetime — measuring it fresh on every
 * update still picks up rotations.
 */
let safeAreaProbe: HTMLDivElement | null = null

export function getSafeAreaProbe(): HTMLDivElement {
  if (safeAreaProbe && safeAreaProbe.isConnected) return safeAreaProbe
  safeAreaProbe = document.createElement('div')
  safeAreaProbe.setAttribute('aria-hidden', 'true')
  safeAreaProbe.dataset.safeAreaProbe = ''
  safeAreaProbe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top,0px);' +
    'visibility:hidden;pointer-events:none'
  document.body.appendChild(safeAreaProbe)
  return safeAreaProbe
}


/**
 * Below the trigger when it fits, otherwise directly above it, then clamped
 * into the visible band.
 *
 * Pure, so the placement rules are testable without a layout engine — which
 * matters, because no environment available here has a software keyboard.
 */
export function verticalPlacement(
  triggerTop: number,
  triggerBottom: number,
  height: number,
  minTop: number,
  viewBottom: number,
): number {
  const bandBottom = viewBottom - EDGE
  const below = triggerBottom + GAP
  const above = triggerTop - GAP - height
  const preferred = below + height <= bandBottom ? below : above
  /*
   * Clamping is the whole of the keyboard handling: no special case for a
   * trigger the keyboard has pushed out of view, because this already lands the
   * popover as close to it as the band allows.
   *
   * The special case this replaces read
   * `Math.max(minTop, Math.min(bandBottom - height, minTop))`, which collapses
   * to `minTop` for every input — so a keyboard-obscured trigger pinned the
   * popover to the very top of the screen, far from the field it belongs to.
   */
  const lowest = Math.max(minTop, bandBottom - height)
  return Math.min(Math.max(preferred, minTop), lowest)
}

/** Left-aligned to the trigger, pulled inside whichever edge it would cross. */
export function horizontalPlacement(
  triggerLeft: number,
  width: number,
  viewLeft: number,
  viewWidth: number,
): number {
  const rightLimit = viewLeft + viewWidth - EDGE
  const leftLimit = viewLeft + EDGE
  if (triggerLeft + width > rightLimit) return Math.max(leftLimit, rightLimit - width)
  return Math.max(leftLimit, triggerLeft)
}

/**
 * Positions a portalled popover below (or above, if near viewport bottom) its
 * trigger element, left-aligned and clamped horizontally to the viewport.
 *
 * Returns **viewport** coordinates, so the popover must be `position: fixed`.
 * That is not a style detail — it is what makes this correct inside a Modal.
 * `useBodyScrollLock` pins the page with `position: fixed; top: -<scrollY>px`
 * on <body>, and a portalled `position: absolute` child is then offset by that
 * same amount, putting the popover hundreds of pixels off-screen whenever the
 * page was scrolled before the modal opened.
 *
 * Only call this hook while the popover is mounted — the popover components
 * render conditionally, so the hook runs only when needed.
 *
 * Repositions when the popover's own size changes, not just on resize and
 * scroll. A popover that grows after it opens — the flag picker revealing its
 * "new flag" input is the case that surfaced this — keeps the placement chosen
 * for its old height, so it either hangs off the bottom of the screen or, once
 * a keyboard shrinks the viewport, flips above and lands somewhere unrelated to
 * the field it belongs to.
 */
export function usePopoverPosition(
  triggerRef: RefObject<HTMLElement | null>,
  popoverRef: RefObject<HTMLElement | null>,
): Position | null {
  const [pos, setPos] = useState<Position | null>(null)

  useLayoutEffect(() => {
    const trigger = triggerRef.current
    const popover = popoverRef.current
    if (!trigger || !popover) return

    const probe = getSafeAreaProbe()

    const update = () => {
      const t = triggerRef.current
      const p = popoverRef.current
      if (!t || !p) return

      const tr = t.getBoundingClientRect()

      /*
       * The visible band, in the same client coordinates getBoundingClientRect
       * reports — which is the whole point of offsetTop.
       *
       * visualViewport.height alone is not enough: it describes a *smaller
       * window* that sits at offsetTop inside the layout viewport, and iOS
       * scrolls a focused field into view when the keyboard opens, so the two
       * stop sharing an origin. Comparing a visual-viewport height against a
       * layout-viewport position placed the popover against a band that was not
       * where it thought, and it landed outside the visible slice entirely —
       * which is how opening the "new flag" input made the popover vanish.
       */
      const vv = window.visualViewport
      const viewTop = vv?.offsetTop ?? 0
      const viewLeft = vv?.offsetLeft ?? 0
      const vw = vv?.width ?? window.innerWidth
      const viewBottom = viewTop + (vv?.height ?? window.innerHeight)

      const minTop = viewTop + EDGE + probe.getBoundingClientRect().height
      // Never collapse to nothing: a sliver of popover is worse than one that
      // overflows slightly and can be scrolled.
      const maxHeight = Math.max(MIN_HEIGHT, viewBottom - EDGE - minTop)
      // The natural height, which is the larger of the content (scrollHeight)
      // and the box. Using the box alone would feed a previous run's cap back in
      // and ratchet down; using scrollHeight alone breaks under jsdom, which has
      // no layout engine and reports 0.
      const natural = Math.max(p.scrollHeight, p.getBoundingClientRect().height)
      const height = Math.min(natural, maxHeight)

      const top = verticalPlacement(tr.top, tr.bottom, height, minTop, viewBottom)
      const left = horizontalPlacement(tr.left, p.getBoundingClientRect().width, viewLeft, vw)

      setPos({ top, left, maxHeight, above: top < tr.top })
    }

    update()

    // The popover's own growth is the case window resize never hears about.
    const observer = new ResizeObserver(update)
    observer.observe(popover)

    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    // The keyboard opening resizes the visual viewport without firing a window
    // resize on iOS, so subscribe to it directly where it exists.
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [triggerRef, popoverRef])

  return pos
}
