import type { TxnType } from '../types'

/** Matches returned when the request does not say. The browser's own index uses the same default. */
export const DEFAULT_SUGGEST_LIMIT = 8
/** The most matches one request may ask for; a larger `limit` is refused rather than trimmed. */
export const MAX_SUGGEST_LIMIT = 25
/** Shortest prefix the server searches, in characters of the normalized text. */
export const MIN_SUGGEST_PREFIX = 2
/** Longest prefix, in characters. A description is at most 140 when it is created. */
export const MAX_SUGGEST_PREFIX = 140
/**
 * Most distinct descriptions one prefix may match before the server refuses. Sorting them is the one
 * step that runs in the Worker, so this bounds its CPU; a prefix this broad is answered by typing more.
 */
export const MAX_SUGGEST_KEYS = 500

/** What a description fills in on a new transaction: the newest row of it. */
export interface DescriptionTemplate {
  type: TxnType
  categoryId: number
  accountId: number
}

/**
 * One distinct description (its normalized text) as the newest row of it speaks for it. `date` and `id`
 * say which row that is, so a caller holding newer rows of the same description can tell whether this is
 * still the newest.
 */
export interface DescriptionMatch {
  label: string
  template: DescriptionTemplate
  date: string
  id: number
}

/** A search over the rows older than `before`, already validated. */
export interface DescriptionSuggestRequest {
  /** The normalized prefix (`normalizeDesc` of what was typed). */
  prefix: string
  /** Only rows dated strictly before this day count; every row counts when absent. */
  before?: string
  limit: number
  /** The browser's locale, which decides how letters sort; the runtime's own when absent. */
  locale?: string
}
