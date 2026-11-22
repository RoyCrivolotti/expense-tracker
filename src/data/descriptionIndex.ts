import type { Transaction } from '../types'
import {
  DEFAULT_SUGGEST_LIMIT,
  MAX_SUGGEST_KEYS,
  type DescriptionMatch,
  type DescriptionSuggestRequest,
  type DescriptionSuggestResult,
  type DescriptionTemplate,
} from '../domain/data/descriptionSuggest'
import { descriptionCollator, inSuggestionOrder } from '../domain/engine/descriptionSearch'
import { normalizeDesc } from '../domain/engine/recurringDetect'

export type { DescriptionMatch, DescriptionTemplate }

export interface DescriptionSuggestion {
  label: string
  template: DescriptionTemplate
}

/** A match of the browser's index: the newest row of the description, and how many rows the index holds of it. */
export interface IndexedMatch extends DescriptionMatch {
  uses: number
}

export interface DescriptionIndex {
  search(
    text: string,
    limit?: number,
  ): DescriptionSuggestion[]
  resolve(label: string): DescriptionSuggestion | undefined
  /**
   * A hook for an index that has more to say than its own rows (a window, whose older rows the server holds): the
   * suggestions for what is typed, the index's own at once and the rest as they arrive. Absent for an index that
   * holds every row, whose `search` is the whole answer.
   */
  useSuggestions?: (
    index: DescriptionIndex,
    value: string,
  ) => DescriptionSuggestion[]
}

/** What `buildDescriptionIndex` returns: `search`, and the same matches with the row each comes from. */
export interface DescriptionEntryIndex extends DescriptionIndex {
  searchEntries: (
    text: string,
    limit?: number,
  ) => IndexedMatch[]
}

/** What the index reads of a row. */
export type IndexRow = Pick<
  Transaction,
  'id' | 'date' | 'description' | 'type' | 'categoryId' | 'accountId' | 'cancelled'
>

/** Normalize for comparison only; canonical label keeps original spelling. */
export const normalizeDescriptionKey = normalizeDesc

/** Whether `a` is a more recent row than `b`: the later date, then the higher id. */
export function isNewer(
  a: DescriptionMatch,
  b: DescriptionMatch,
): boolean {
  if (a.date !== b.date) return a.date > b.date
  return a.id > b.id
}

interface Keyed {
  key: string
  entry: IndexedMatch
}

function buildEntries(rows: readonly IndexRow[]): Map<string, IndexedMatch> {
  const entries = new Map<string, IndexedMatch>()
  for (const txn of rows) {
    if (txn.cancelled) continue
    const label = txn.description.trim()
    if (!label) continue
    const key = normalizeDescriptionKey(label)
    const existing = entries.get(key)
    const candidate: IndexedMatch = {
      label: txn.description,
      template: { type: txn.type, categoryId: txn.categoryId, accountId: txn.accountId },
      date: txn.date,
      id: txn.id,
      uses: (existing?.uses ?? 0) + 1,
    }
    entries.set(key, !existing || isNewer(candidate, existing) ? candidate : { ...existing, uses: candidate.uses })
  }
  return entries
}

/**
 * The order the list is shown in: descriptions that start with what was typed before those that only contain it,
 * the most used first among each, and the most recently used first among descriptions used as often. No two
 * descriptions of one index share a newest row, so the order is total without a collator; the key settles the one
 * case a merge can bring (a row renamed between the browser's index and the server's answer speaks for two keys).
 */
export function compareByUsage(typed: string): (
  a: { key: string; entry: IndexedMatch },
  b: { key: string; entry: IndexedMatch },
) => number {
  return (
    a,
    b,
  ) => {
    const aStarts = a.key.startsWith(typed)
    const bStarts = b.key.startsWith(typed)
    if (aStarts !== bStarts) return aStarts ? -1 : 1
    if (a.entry.uses !== b.entry.uses) return b.entry.uses - a.entry.uses
    if (a.entry.date !== b.entry.date || a.entry.id !== b.entry.id) return isNewer(a.entry, b.entry) ? -1 : 1
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  }
}

export interface DescriptionIndexOptions {
  /** How letters sort, for the `key` order. The runtime's own locale when absent, which is what a browser wants. */
  locale?: string
  /**
   * What a search finds and how it is ordered. `usage` (the default, what the app lists) finds the typed text
   * anywhere in a description and orders by `compareByUsage`. `key` is the server's contract for older rows
   * (`GET /descriptions/suggest`): descriptions that start with the text, by the collator over the normalized
   * text (`descriptionSearch.ts`), so that the parity tests can hold the SQL to the index over the same rows.
   */
  order?: 'usage' | 'key'
}

export function buildDescriptionIndex(
  rows: readonly IndexRow[],
  { locale, order = 'usage' }: DescriptionIndexOptions = {},
): DescriptionEntryIndex {
  const entries = buildEntries(rows)
  const keyed: Keyed[] = [...entries].map(([key, entry]) => ({ key, entry }))
  const collator = descriptionCollator(locale)

  const lookup = (key: string): DescriptionSuggestion | undefined => {
    const entry = entries.get(key)
    return entry ? { label: entry.label, template: entry.template } : undefined
  }

  const searchEntries = (
    text: string,
    limit = DEFAULT_SUGGEST_LIMIT,
  ): IndexedMatch[] => {
    const typed = normalizeDescriptionKey(text)
    if (!typed) return []
    const ordered =
      order === 'key'
        ? inSuggestionOrder(
            keyed.filter((item) => item.key.startsWith(typed)),
            collator,
          )
        : keyed.filter((item) => item.key.includes(typed)).sort(compareByUsage(typed))
    return ordered.slice(0, limit).map(({ entry }) => entry)
  }

  return {
    resolve: (label) => lookup(normalizeDescriptionKey(label)),
    searchEntries,
    search: (
      text,
      limit,
    ) => searchEntries(text, limit).map(({ label, template }) => ({ label, template })),
  }
}

/**
 * The first `limit` matches over the browser's own rows and the descriptions the server found among the rows older
 * than them, in the order the list is shown in (`compareByUsage`). A description found on both sides is spoken for
 * by its newer row and counted by the rows the browser holds; one the server alone found is counted as unused, since
 * the server does not count rows, so it lists after the browser's own among descriptions that match the same way.
 */
export function mergeDescriptionMatches(
  own: readonly IndexedMatch[],
  older: readonly DescriptionMatch[],
  { text, limit = DEFAULT_SUGGEST_LIMIT }: { text: string; limit?: number },
): IndexedMatch[] {
  const typed = normalizeDescriptionKey(text)
  const merged = new Map<string, IndexedMatch>()
  for (const match of [...own.map((m) => ({ ...m })), ...older.map((m) => ({ ...m, uses: 0 }))]) {
    const key = normalizeDescriptionKey(match.label)
    const held = merged.get(key)
    if (!held) merged.set(key, match)
    else if (isNewer(match, held)) merged.set(key, { ...match, uses: Math.max(match.uses, held.uses) })
    else merged.set(key, { ...held, uses: Math.max(match.uses, held.uses) })
  }
  return [...merged]
    .map(([key, entry]) => ({ key, entry }))
    .sort(compareByUsage(typed))
    .slice(0, limit)
    .map(({ entry }) => entry)
}

/**
 * What `GET /descriptions/suggest` answers over a whole set of rows: the reference the route is held to. The server
 * walks every description of the owner in the prefix range, whatever its status or month, and counts those against
 * the cap; the matches are then the eligible rows among them.
 */
export function suggestDescriptionsOf(
  rows: readonly (IndexRow & Pick<Transaction, 'budgetMonth'>)[],
  { prefix, before, limit, locale }: DescriptionSuggestRequest,
): DescriptionSuggestResult {
  const walked = new Set(
    rows.map((row) => normalizeDescriptionKey(row.description)).filter((key) => key.startsWith(prefix)),
  )
  if (walked.size > MAX_SUGGEST_KEYS) return { items: [], tooBroad: true }
  const eligible = rows.filter((row) => before === undefined || row.budgetMonth < before)
  const index = buildDescriptionIndex(eligible, { order: 'key', ...(locale ? { locale } : {}) })
  return { items: index.searchEntries(prefix, limit).map(({ uses: _uses, ...match }) => match), tooBroad: false }
}
