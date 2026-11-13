import { useRef, useState } from 'react'
import {
  announceRecommendationsChanged,
  PossibleDuplicateError,
  type PossibleMatch,
} from '../../data/recommendationsApi'
import type { DuplicateOffer, TransactionSeed } from '../actions'
import { useToast } from '../hooks/useToast'

/**
 * What the add form does when the server refuses a captured payment because a typed row already looks like it: it keeps
 * the row it was told about and offers Link or Add anyway. `moveOn` is called once a link has settled the payment, as a
 * save would, so the queue goes on to the next one.
 */
export function useDuplicateOffer(seed: TransactionSeed | undefined, moveOn: () => void) {
  const { showToast } = useToast()
  // Kept with the payment it was found for, since the form moves on to the next payment of a queue in this same hook.
  const [found, setFound] = useState<{ id: string; match: PossibleMatch } | null>(null)
  const anyway = useRef(false)
  const id = seed?.recommendationId

  const onLinked = (row: PossibleMatch) => {
    announceRecommendationsChanged()
    showToast(`Linked \u00b7 to your typed row "${row.description}". Nothing new was added.`, 'success')
    moveOn()
  }

  const offer: DuplicateOffer | undefined =
    found && id && found.id === id
      ? {
          match: found.match,
          recommendationId: id,
          onLinked: () => onLinked(found.match),
          addAnyway: () => void (anyway.current = true),
        }
      : undefined

  return {
    offer,
    /**
     * Whether the next save goes ahead whatever it matches: the person pressed Add anyway, or the list already showed
     * them this payment's match, so they are not asked twice. Read once per save.
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
