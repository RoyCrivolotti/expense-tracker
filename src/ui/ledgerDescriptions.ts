import { useEffect, useMemo, useState } from 'react'
import type { LedgerPartsSource } from '../data/dataSource'
import {
  type DescriptionEntryIndex,
  type DescriptionIndex,
  type DescriptionMatch,
  type DescriptionSuggestion,
  mergeDescriptionMatches,
  normalizeDescriptionKey,
} from '../data/descriptionIndex'
import type { HeldLedger } from '../data/ledgerHold'
import { DEFAULT_SUGGEST_LIMIT } from '../domain/data/descriptionSuggest'

/** How this browser sorts letters, which the server is told so that its matches come in the order the browser's own do. */
export const BROWSER_LOCALE = new Intl.Collator().resolvedOptions().locale

/** How long a prefix has to stay as it is before the server is asked about it, so that typing is one read of the last text. */
const SETTLE_MS = 200

/**
 * Where the rows a window holds stop and the server's begin: the budget month from which every month to the newest is
 * held as rows (rows before it are the server's, and rows the window holds beyond a gap are found on both sides, which
 * the merge takes once). `before` is absent when the newest month is not held, and the server then answers for every
 * row. Null when every month is held, so there are no older rows to ask for.
 */
export function olderThan(held: HeldLedger): { before: string | undefined } | null {
  let before: string | undefined
  for (let at = held.months.length - 1; at >= 0; at -= 1) {
    const month = held.months[at]!
    if (!held.rows.has(month)) return { before }
    before = month
  }
  return null
}

/**
 * The description index of a window: the matches among the rows held come at once, and when the browser is online
 * the older matches the server finds for the same prefix are merged in once the typing settles. They are exact
 * (`mergeDescriptionMatches`) because the index is in the server's order. Typing is never held up: a read that is
 * overtaken by more typing is cancelled, one that fails or is refused leaves the matches already shown, and a prefix
 * the server calls too broad keeps the rows held until more is typed. What was read is kept for the index's life, so
 * erasing a letter asks nothing; a new index (the rows held changed) asks again.
 */
export function withOlderDescriptions(
  index: DescriptionEntryIndex,
  source: Pick<LedgerPartsSource, 'readDescriptionSuggest'>,
  { before, locale }: { before: string | undefined; locale: string },
): DescriptionIndex {
  const asked = new Map<string, DescriptionMatch[]>()

  function useSuggestions(_index: DescriptionIndex, value: string): DescriptionSuggestion[] {
    const prefix = normalizeDescriptionKey(value)
    const own = useMemo(() => (prefix ? index.searchEntries(value) : []), [prefix, value])
    const [last, setLast] = useState<{ prefix: string; items: DescriptionMatch[] } | null>(null)
    useEffect(() => {
      if (!prefix || asked.has(prefix) || (typeof navigator !== 'undefined' && !navigator.onLine)) return
      const controller = new AbortController()
      const timer = setTimeout(() => {
        const request = { prefix, limit: DEFAULT_SUGGEST_LIMIT, locale, ...(before === undefined ? {} : { before }) }
        source.readDescriptionSuggest(request, { signal: controller.signal }).then(
          ({ items, tooBroad }) => {
            const found = tooBroad ? [] : items
            asked.set(prefix, found)
            setLast({ prefix, items: found })
          },
          () => undefined,
        )
      }, SETTLE_MS)
      return () => {
        clearTimeout(timer)
        controller.abort()
      }
    }, [prefix])
    // Until the read for this prefix is in, the matches of the shorter one that still fit it are shown, so that older
    // matches do not drop out of the list and come back as the typing goes on.
    const older =
      asked.get(prefix) ??
      (last && prefix.startsWith(last.prefix) ? last.items.filter((m) => normalizeDescriptionKey(m.label).startsWith(prefix)) : undefined)
    return useMemo(() => {
      const matches = older && older.length > 0 ? mergeDescriptionMatches(own, older, DEFAULT_SUGGEST_LIMIT, locale) : own
      return matches.map(({ label, template }) => ({ label, template }))
    }, [own, older])
  }

  return { search: (prefix, limit) => index.search(prefix, limit), resolve: (label) => index.resolve(label), useSuggestions }
}
