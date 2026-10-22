import { useState } from 'react'
import type { MatchingTarget } from '../../data/dataSource'

/** What a list read in pages lets a selection do beyond the rows it holds. */
export interface PagedSelection {
  /** The rows the filter matches, as shown, when an edit may name them by the filter. */
  matching: MatchingTarget | null
  /** Tells one filter from another, so that a selection of every matching row ends when the filter changes. */
  filterKey: string
}

/**
 * "Select all N that match": the selection of every row a filter matches, of which the list holds only some. It is
 * the count and revision the user was shown when they chose it, kept as they were, because the write is refused if
 * either has moved. It ends when the filter changes, and the caller ends it when the user picks or clears rows.
 */
export function useMatchingSelection(paged: PagedSelection | undefined) {
  const [chosen, setChosen] = useState<{ target: MatchingTarget; filterKey: string } | null>(null)
  const target = chosen !== null && chosen.filterKey === paged?.filterKey ? chosen.target : null
  return {
    /** The rows chosen as every one the filter matches, or null. */
    target,
    /** What the user can choose now, or null. */
    offer: paged?.matching ?? null,
    choose: () => {
      if (paged?.matching) setChosen({ target: paged.matching, filterKey: paged.filterKey })
    },
    clear: () => setChosen(null),
  }
}
