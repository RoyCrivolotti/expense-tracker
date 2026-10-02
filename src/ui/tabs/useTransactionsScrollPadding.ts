import { useEffect } from 'react'
import { DAY_HEADER_SELECTOR } from '../components/dayGroupId'
import { trackScrollPadding } from '../hooks/scrollPadding'
import { PINNED_AIR_PX, stickyBottom } from '../hooks/stickyScroll'
import { RESULTS_ANCHOR_ID } from './scrollToResults'

/** What is pinned under the app header: the result bar, and under it the day header of the group being read. */
function pinnedElements(): (HTMLElement | null)[] {
  return [document.getElementById(RESULTS_ANCHOR_ID), document.querySelector<HTMLElement>(DAY_HEADER_SELECTOR)]
}

/**
 * While the Transactions list is on screen, tell the browser that its visible area starts under
 * the result bar and the day header that sticks beneath it, so a row reached with Shift+Tab is
 * scrolled clear of them instead of left behind them. The app header and the bottom bar are
 * already counted by the page (theme.css).
 *
 * The day headers are the same height, so the first one stands for all of them. Whether there are
 * any, and how tall they are, depends on whether any rows match and on picking rows, which is
 * what the two arguments are here to measure again on.
 */
export function useTransactionsScrollPadding(hasRows: boolean, selecting: boolean): void {
  useEffect(
    () =>
      trackScrollPadding({
        top: () =>
          Math.max(0, ...pinnedElements().map((el) => (el ? stickyBottom(el) : 0))) + PINNED_AIR_PX,
        watch: pinnedElements,
      }),
    [hasRows, selecting],
  )
}
