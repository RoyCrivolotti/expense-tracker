import { useEffect, useState } from 'react'
import { fetchCardLinks, type CardLink } from '../../data/captureCardsApi'

/** The digits of the other cards an account already has, for the picker. */
export function otherCardsOf(links: readonly CardLink[], accountId: number, card: { source: string; digits: string }): string[] {
  return links.filter((l) => l.accountId === accountId && !(l.source === card.source && l.digits === card.digits)).map((l) => l.digits)
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
