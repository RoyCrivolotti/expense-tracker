import type { Transaction } from '../types'
import {
  DEFAULT_SUGGEST_LIMIT,
  type DescriptionMatch,
  type DescriptionTemplate,
} from '../domain/data/descriptionSuggest'
import { descriptionCollator, inSuggestionOrder } from '../domain/engine/descriptionSearch'
import { normalizeDesc } from '../domain/engine/recurringDetect'

export type { DescriptionMatch, DescriptionTemplate }

export interface DescriptionSuggestion {
  label: string
  template: DescriptionTemplate
}

export interface DescriptionIndex {
  search(prefix: string, limit?: number): DescriptionSuggestion[]
  resolve(label: string): DescriptionSuggestion | undefined
}

/** What `buildDescriptionIndex` returns: `search`, and the same matches with the row each comes from. */
export interface DescriptionEntryIndex extends DescriptionIndex {
  searchEntries(prefix: string, limit?: number): DescriptionMatch[]
}

/** What the index reads of a row. */
export type IndexRow = Pick<
  Transaction,
  'id' | 'date' | 'description' | 'type' | 'categoryId' | 'accountId' | 'cancelled'
>

/** Normalize for comparison only; canonical label keeps original spelling. */
export const normalizeDescriptionKey = normalizeDesc

interface TrieNode {
  children: Map<string, TrieNode>
  /** Normalized keys whose full text ends at this node. */
  keys: string[]
}

/** Whether `a` is a more recent row than `b`: the later date, then the higher id. */
export function isNewer(a: DescriptionMatch, b: DescriptionMatch): boolean {
  if (a.date !== b.date) return a.date > b.date
  return a.id > b.id
}

function insertKey(root: TrieNode, key: string): void {
  let node = root
  for (const ch of key) {
    let next = node.children.get(ch)
    if (!next) {
      next = { children: new Map(), keys: [] }
      node.children.set(ch, next)
    }
    node = next
  }
  if (!node.keys.includes(key)) node.keys.push(key)
}

function collectKeys(node: TrieNode, out: string[]): void {
  out.push(...node.keys)
  for (const child of node.children.values()) collectKeys(child, out)
}

function buildEntries(rows: IndexRow[]): Map<string, DescriptionMatch> {
  const entries = new Map<string, DescriptionMatch>()
  for (const txn of rows) {
    if (txn.cancelled) continue
    const label = txn.description.trim()
    if (!label) continue
    const key = normalizeDescriptionKey(label)
    const candidate: DescriptionMatch = {
      label: txn.description,
      template: { type: txn.type, categoryId: txn.categoryId, accountId: txn.accountId },
      date: txn.date,
      id: txn.id,
    }
    const existing = entries.get(key)
    if (!existing || isNewer(candidate, existing)) entries.set(key, candidate)
  }
  return entries
}

function buildTrie(keys: string[]): TrieNode {
  const root: TrieNode = { children: new Map(), keys: [] }
  for (const key of keys) insertKey(root, key)
  return root
}

export interface DescriptionIndexOptions {
  /** How letters sort. The runtime's own locale when absent, which is what a browser wants. */
  locale?: string
  /**
   * How matches are ordered. `label` (the default, and what the app has always used) sorts by the newest
   * row's label and leaves descriptions the collator calls equal in the order the rows arrived. `key` sorts
   * by the normalized text with ties broken by the text (`descriptionSearch.ts`), which is the order the
   * server's answer for older rows is in and the only one in which the two can be merged exactly. The app
   * passes `key` once it merges; `label` goes with the change that does.
   */
  order?: 'label' | 'key'
}

export function buildDescriptionIndex(
  rows: IndexRow[],
  { locale, order = 'label' }: DescriptionIndexOptions = {},
): DescriptionEntryIndex {
  const entries = buildEntries(rows)
  const root = buildTrie([...entries.keys()])
  const collator = descriptionCollator(locale)

  const lookup = (key: string): DescriptionSuggestion | undefined => {
    const entry = entries.get(key)
    return entry ? { label: entry.label, template: entry.template } : undefined
  }

  const searchEntries = (prefix: string, limit = DEFAULT_SUGGEST_LIMIT): DescriptionMatch[] => {
    const norm = normalizeDescriptionKey(prefix)
    if (!norm) return []

    let node: TrieNode = root
    for (const ch of norm) {
      const next = node.children.get(ch)
      if (!next) return []
      node = next
    }

    const keys: string[] = []
    collectKeys(node, keys)
    const matches = [...new Set(keys)].map((key) => ({ key, entry: entries.get(key)! }))
    const ordered =
      order === 'key' ? inSuggestionOrder(matches, collator) : [...matches].sort((a, b) => collator.compare(a.entry.label, b.entry.label))
    return ordered.slice(0, limit).map(({ entry }) => entry)
  }

  return {
    resolve: (label) => lookup(normalizeDescriptionKey(label)),
    searchEntries,
    search: (prefix, limit) =>
      searchEntries(prefix, limit).map(({ label, template }) => ({ label, template })),
  }
}

/**
 * The first `limit` matches over the browser's own rows and the rows older than them, from the matches
 * each side found for the same prefix. A description found on both sides is spoken for by its newer
 * row. The result is what `buildDescriptionIndex` gives over every row, because a description's place
 * in the order does not depend on which row speaks for it (see `descriptionSearch.ts`), so the first
 * `limit` of the whole are among the first `limit` of one side or the other.
 */
export function mergeDescriptionMatches(
  own: DescriptionMatch[],
  older: DescriptionMatch[],
  limit = DEFAULT_SUGGEST_LIMIT,
  locale?: string,
): DescriptionMatch[] {
  const newest = new Map<string, DescriptionMatch>()
  for (const match of [...own, ...older]) {
    const key = normalizeDescriptionKey(match.label)
    const held = newest.get(key)
    if (!held || isNewer(match, held)) newest.set(key, match)
  }
  const merged = [...newest].map(([key, entry]) => ({ key, entry }))
  return inSuggestionOrder(merged, descriptionCollator(locale))
    .slice(0, limit)
    .map(({ entry }) => entry)
}
