import { useEffect, useState } from 'react'
import { fetchCardLinks, linkCard, type CardLink } from '../../data/captureCardsApi'
import { announceRecommendationsChanged } from '../../data/recommendationsApi'
import type { SeedCard } from '../actions'

/** The digits of the other cards an account already has, for the picker. */
export function otherCardsOf(
  links: readonly CardLink[],
  accountId: number,
  card: { source: string; digits: string },
): string[] {
  return links
    .filter((l) => l.accountId === accountId && !(l.source === card.source && l.digits === card.digits))
    .map((l) => l.digits)
}

/** The person's card links, read once. The picker works without them, so a failed read only loses the hint. */
export function useCardLinks(): readonly CardLink[] {
  const [links, setLinks] = useState<readonly CardLink[]>([])
  useEffect(() => {
    let current = true
    fetchCardLinks().then(
      (found) => current && setLinks(found.cards),
      () => undefined,
    )
    return () => {
      current = false
    }
  }, [])
  return links
}

/**
 * What the add form calls once a payment from an unlinked card is saved: links the card to the account it was saved
 * with, tells `onLinked` (keyed `source:digits`) and the list, and resolves with the message to show when it could not.
 * Nothing to do for a payment with no card to ask about.
 */
export function rememberCardOf(
  view: { askCard: { source: string; digits: string } | null },
  onLinked: (
    key: string,
    accountId: number,
  ) => void = () => undefined,
): SeedCard['remember'] {
  const card = view.askCard
  return async (accountId) => {
    if (!card) return null
    try {
      await linkCard(card.source, card.digits, accountId)
      onLinked(`${card.source}:${card.digits}`, accountId)
      announceRecommendationsChanged()
      return null
    } catch (e) {
      return `The payment was added, but this card could not be remembered: ${e instanceof Error ? e.message : 'something went wrong'}`
    }
  }
}
