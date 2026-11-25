import { useRef, useState } from 'react'
import {
  announceRecommendationsChanged,
  PossibleDuplicateError,
  type PossibleMatch,
} from '../../data/recommendationsApi'
import type { DuplicateOffer, TransactionSeed } from '../actions'
import { useToast } from '../hooks/useToast'

/**
 * What the add form does when a typed row already looks like a captured payment: it offers Link or Add anyway, for the
 * row the list found (the seed's) from the start, or for the one the server names when it refuses the save. The list's
 * row is shown too, since a payment opened from a queue was never shown its card. `moveOn` is called once a link has
 * settled the payment, as a save would, so the queue goes on to the next one.
 */
export function useDuplicateOffer(
  seed: TransactionSeed | undefined,
  moveOn: () => void,
) {
  const { showToast } = useToast()
  // Kept with the payment it was found for, since the form moves on to the next payment of a queue in this same hook.
  const [found, setFound] = useState<{ id: string; match: PossibleMatch } | null>(null)
  const anyway = useRef(false)
  const id = seed?.recommendationId

  const onLinked = (row: PossibleMatch) => {
    announceRecommendationsChanged()
    showToast(`Linked \u00b7 to the row "${row.description}". Nothing new was added.`, 'success')
    moveOn()
  }

  const match = found && found.id === id ? found.match : seed?.possibleMatch
  const offer: DuplicateOffer | undefined =
    match && id
      ? {
          match,
          recommendationId: id,
          onLinked: () => onLinked(match),
          addAnyway: () => {
            anyway.current = true
            // The button submits the form, which reads this at once. If the form refuses (a field is invalid) nothing
            // reads it, and it must not leak into the next ordinary Add.
            setTimeout(() => (anyway.current = false), 0)
          },
        }
      : undefined

  return {
    offer,
    /**
     * Whether the next save goes ahead whatever it matches: the person pressed Add anyway, or the form already shows
     * them this payment's match from the list, so they are not asked twice. Read once per save.
     */
    takeAllow: () => {
      const allow = anyway.current || seed?.possibleMatch !== undefined
      anyway.current = false
      return allow
    },
    /** The error the form shows for a refused save: empty for a duplicate, since the offer says it. Anything else is passed on. */
    refused: (error: unknown): unknown => {
      if (!(error instanceof PossibleDuplicateError)) return error
      if (id) setFound({ id, match: error.possibleMatch })
      return new Error('', { cause: error })
    },
  }
}
