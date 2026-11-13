import type { TransactionSeed } from '../actions'
import type { ReviewView } from './reviewFields'
import { seedOf } from './reviewFields'

/**
 * The add form for one payment, with the ones after it queued behind. The queue is the ids that followed it when it
 * was opened; each step looks them up again in the latest views, so a payment decided in the meantime is skipped.
 */
export function queuedSeed(
  view: ReviewView,
  after: readonly string[],
  latest: () => readonly ReviewView[],
  dontAdd: (view: ReviewView) => void,
): TransactionSeed {
  const stillOpen = (id: string) => latest().some((v) => v.rec.id === id)
  const next = (): TransactionSeed | undefined => {
    for (let i = 0; i < after.length; i++) {
      const found = latest().find((v) => v.rec.id === after[i])
      if (found) return queuedSeed(found, after.slice(i + 1), latest, dontAdd)
    }
    return undefined
  }
  return {
    ...seedOf(view),
    queue: {
      left: after.filter(stillOpen).length,
      next,
      dontAdd: () => {
        dontAdd(view)
        return next()
      },
    },
  }
}
