/** The results summary doubles as the scroll anchor and the list's live region. */
export const RESULTS_ANCHOR_ID = 'txn-results'

/**
 * Bring the filtered transaction list into view.
 *
 * The Flagged card sits above the filters, the Installments card and Upcoming,
 * so on a phone the rows a drill-in just filtered are well below the fold and
 * the click reads as a no-op. Deferred a frame so the scroll measures the list
 * *after* React has re-rendered it, not the taller pre-filter one.
 */
export function scrollToResults(): void {
  const run = () => {
    document.getElementById(RESULTS_ANCHOR_ID)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
  else run()
}
