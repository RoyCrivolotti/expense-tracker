type Dismiss = () => void

/**
 * Which chart currently owns an open tooltip, across the whole page. Charts each track
 * their own focus independently (see useChartFocus), so nothing stops two of them from
 * opening at once unless something outside React state ties them together. A module-level
 * singleton does that without a provider: any page that renders more than one chart gets
 * the exclusivity for free.
 */
let currentDismiss: Dismiss | null = null

/**
 * Closes whichever chart's tooltip currently owns the page and installs `dismiss` as the
 * new owner. Re-claiming with the same reference the caller already owns is a no-op, so a
 * chart calling this from an effect that re-runs for unrelated reasons can't dismiss itself.
 */
export function claimActiveTooltip(dismiss: Dismiss): void {
  if (currentDismiss === dismiss) return
  currentDismiss?.()
  currentDismiss = dismiss
}

/** Clears the claim, but only if `dismiss` is still the current owner. */
export function releaseActiveTooltip(dismiss: Dismiss): void {
  if (currentDismiss === dismiss) currentDismiss = null
}

/** Test-only: this is module-level state, so tests must reset it between cases. */
export function __resetActiveTooltipRegistryForTests(): void {
  currentDismiss = null
}
