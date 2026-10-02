import { useEffect } from 'react'
import type { GoalsMobileView } from './goalsView'
import { ADJUST_STACK_ID, GAP_PX, pinnedBottom } from './scrollToAdjustSection'
import { GOALS_NAV_ID } from './scrollToGoalsContent'

/** What the fixed bottom bar and the home indicator cover, and a little air above them. */
const BOTTOM_PADDING = 'calc(var(--exp-bottom-bar) + env(safe-area-inset-bottom, 0px) + 0.5rem)'

/**
 * The top padding again as a custom property, for what has to take it back out of its scroll
 * margin: the browser adds a target's margin to the page's padding, so the content anchor, which
 * is put just under the row on purpose, would land too low, and the pinned blocks themselves
 * would count as hidden and be scrolled to.
 */
const TOP_PADDING_VAR = '--scroll-pad-top'

/**
 * While the phone's view row is on screen, tell the browser where the page's visible area
 * starts and ends, so a control that takes focus from the keyboard is scrolled clear of what is
 * pinned over it. The browser scrolls to the edge of the screen, and the app header, the view
 * row and Adjust's stack sit over the top of it and the bottom bar over the bottom.
 *
 * The top follows what is pinned, which changes with the view and with the screen: the stack is
 * only pinned in Adjust, and not at all on a short screen. `view` is there to run it again
 * when the view changes.
 */
export function usePinnedScrollPadding(view: GoalsMobileView): void {
  useEffect(() => {
    const root = document.documentElement
    const before = {
      top: root.style.scrollPaddingTop,
      bottom: root.style.scrollPaddingBottom,
      topVar: root.style.getPropertyValue(TOP_PADDING_VAR),
    }
    const apply = () => {
      const top = `${pinnedBottom() + GAP_PX}px`
      root.style.scrollPaddingTop = top
      root.style.scrollPaddingBottom = BOTTOM_PADDING
      root.style.setProperty(TOP_PADDING_VAR, top)
    }
    apply()

    window.addEventListener('resize', apply)
    // The row and the stack change height with the text size, and the stack comes and goes.
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(apply) : null
    for (const id of [GOALS_NAV_ID, ADJUST_STACK_ID]) {
      const pinned = document.getElementById(id)
      if (pinned) observer?.observe(pinned)
    }

    return () => {
      window.removeEventListener('resize', apply)
      observer?.disconnect()
      root.style.scrollPaddingTop = before.top
      root.style.scrollPaddingBottom = before.bottom
      if (before.topVar) root.style.setProperty(TOP_PADDING_VAR, before.topVar)
      else root.style.removeProperty(TOP_PADDING_VAR)
    }
  }, [view])
}
