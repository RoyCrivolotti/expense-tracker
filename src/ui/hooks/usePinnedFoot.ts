import { useLayoutEffect, type RefObject } from 'react'

/** The custom property a sheet reads for the room it keeps at its foot (`Modal.module.css`, `.sheet`). */
export const PINNED_FOOT_VAR = '--sheet-pinned-foot'

/**
 * Air left between a field brought into view and the top of the bar. WebKit brings a text field's text into view, not
 * its box, so the air has to be more than the field's own padding and border or its lower edge stays under the bar.
 */
export const PINNED_FOOT_AIR_PX = 16

/**
 * Keeps the sheet a bar is pinned in from bringing a field into view behind it. A browser counts a field under a
 * sticky bar as visible, so Tab, or a field focused on a short screen, would stop there, covered. The sheet's scroll
 * padding at its foot is the bar's height, measured as it changes (an error in the bar makes it taller), and is taken
 * off again when the bar goes. The bar reaches the sheet's bottom edge, so its height is all it covers.
 *
 * The sheet is the dialog the bar is in, which is what scrolls (`Modal`).
 */
export function usePinnedFoot(
  barRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  useLayoutEffect(() => {
    const bar = barRef.current
    const sheet = bar?.closest<HTMLElement>('[role="dialog"]')
    if (!enabled || !bar || !sheet) return
    const measure = () =>
      sheet.style.setProperty(PINNED_FOOT_VAR, `${bar.getBoundingClientRect().height + PINNED_FOOT_AIR_PX}px`)
    measure()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(bar)
    return () => {
      observer?.disconnect()
      sheet.style.removeProperty(PINNED_FOOT_VAR)
    }
  }, [barRef, enabled])
}
