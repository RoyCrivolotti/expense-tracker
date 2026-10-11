import type * as SpreadModule from './SpreadChart'

let pending: Promise<typeof SpreadModule> | null = null

/** The spread card's code, in its own chunk and fetched once; the same promise serves a preload and the card. */
export function loadSpreadChart(): Promise<typeof SpreadModule> {
  pending ??= import('./SpreadChart').catch((error: unknown) => {
    // A failed fetch is tried again by the next tap, not remembered.
    pending = null
    throw error
  })
  return pending
}

/**
 * Fetches the card's code ahead of its chip. On a phone the card is only mounted when its chip is chosen, and a
 * tap that has to wait for the code swaps a short placeholder for a tall card, which Safari shows as the page
 * jumping. A failure here is silent: the tap fetches it again and the card's own failure message covers that.
 */
export function preloadSpreadChart(): void {
  loadSpreadChart().catch(() => undefined)
}
