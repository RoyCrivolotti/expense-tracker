import type { Transaction } from '../types'

/** Rows in a list page when the request does not say. */
export const DEFAULT_PAGE_LIMIT = 50
/** The most rows one page may ask for; a larger `limit` is refused rather than trimmed. */
export const MAX_PAGE_LIMIT = 200
/** The summary counts up to this many rows and reports `capped` beyond it. */
export const SUMMARY_COUNT_CAP = 1000
/** Longest search text, in characters. */
export const MAX_QUERY_LENGTH = 200
/** Most labels one filter may name. */
export const MAX_FILTER_LABELS = 100
/** Most distinct non-ASCII letters the search text may contain; see {@link caseFolds}. */
export const MAX_CASE_FOLDS = 8

/** Where a list page starts: the last row of the previous page. */
export interface TransactionKey {
  date: string
  id: number
}

export interface TransactionPageRequest {
  /** Rows wanted, 1 to {@link MAX_PAGE_LIMIT}. */
  limit: number
  /** Rows strictly after this one in `date DESC, id DESC` order. */
  after?: TransactionKey
}

export interface TransactionPage {
  items: Transaction[]
  /** Whether a row exists beyond this page. */
  hasMore: boolean
}

export interface TransactionSummary {
  /** Matching rows, at most {@link SUMMARY_COUNT_CAP}. */
  count: number
  /** True when more than {@link SUMMARY_COUNT_CAP} rows match, so `count` is a lower bound. */
  capped: boolean
  /** Same figure as `netSpendCents` over every matching row (never capped). */
  netSpendCents: number
}

/**
 * Letter pairs a case-insensitive text search has to fold by hand. SQLite lowers only ASCII letters,
 * so "CAFÉ" would not match a search for "café" unless each non-ASCII letter of the search text has
 * its capital replaced by it first. `needle` must already be lower-cased. Letters whose capital is
 * not a single character that lower-cases back to them (ß, final-form sigma) are left alone, as are
 * the few capitals that lower-case to something else (the Kelvin sign, İ).
 */
export function caseFolds(needle: string): Array<[upper: string, lower: string]> {
  const pairs = new Map<string, string>()
  for (const letter of needle) {
    if ((letter.codePointAt(0) ?? 0) < 128) continue
    const upper = letter.toUpperCase()
    if (upper !== letter && [...upper].length === 1 && upper.toLowerCase() === letter) {
      pairs.set(upper, letter)
    }
  }
  return [...pairs]
}
