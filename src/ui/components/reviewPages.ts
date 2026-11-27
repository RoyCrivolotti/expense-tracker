import { useSyncExternalStore } from 'react'
import type { QueueSpot, SeedQueue } from '../seedQueue'

const noWatch = () => () => {}

/** Where the form's payment sits among the ones waiting, read again whenever that list changes. */
export function useQueueSpot(queue: SeedQueue | undefined): QueueSpot {
  // A string, so an unchanged place reads as the same snapshot and does not draw again.
  const text = useSyncExternalStore(queue?.watch ?? noWatch, () => {
    const spot = queue?.spot()
    return spot ? `${spot.at}/${spot.of}` : '0/0'
  })
  const [at = 0, of = 0] = text.split('/').map(Number)
  return { at, of }
}
