import { useEffect } from 'react'
import { trackScrollPadding } from '../../hooks/scrollPadding'
import type { GoalsMobileView } from './goalsView'
import { ADJUST_STACK_ID, GOALS_NAV_ID } from './goalsAnchors'
import { GAP_PX, pinnedBottom } from './scrollToAdjustSection'

/**
 * While the phone's view row is on screen, tell the browser where the page's visible area
 * starts, so a control that takes focus from the keyboard is scrolled clear of what is pinned
 * over it. The browser scrolls to the edge of the screen, and the app header, the view row and
 * Scenarios' stack sit over the top of it. The bottom is left to theme.css, which clears the
 * bottom bar: that exists below 768px, and this row is mounted up to 899px.
 *
 * The top follows what is pinned, which changes with the view and with the screen: the stack is
 * only pinned in Scenarios, and not at all on a short screen. `view` is there to run it again
 * when the view changes. The row and the stack change height with the text size, and the stack
 * comes and goes, so both are watched.
 */
export function usePinnedScrollPadding(view: GoalsMobileView): void {
  useEffect(
    () =>
      trackScrollPadding({
        top: () => pinnedBottom() + GAP_PX,
        watch: () => [GOALS_NAV_ID, ADJUST_STACK_ID].map((id) => document.getElementById(id)),
      }),
    [view],
  )
}
