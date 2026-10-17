import type { TxnType } from '../types'

/** Matches returned when the request does not say. The browser's own index uses the same default. */
export const DEFAULT_SUGGEST_LIMIT = 8
/** The most matches one request may ask for; a larger `limit` is refused rather than trimmed. */
export const MAX_SUGGEST_LIMIT = 25
/** Longest prefix, in characters. A description is at most 140 when it is created. */
export const MAX_SUGGEST_PREFIX = 140
/**
 * Most distinct descriptions one prefix may match before the server stops and says the prefix is too
 * broad. Sorting them is the one step that runs in the Worker, so this bounds its CPU; a prefix this
 * broad is answered by typing more. It counts every description of the owner that starts with the
 * prefix, whatever its status or month, because that is what the statement walks.
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

/** A search over the rows booked in months before `before`, already validated. */
export interface DescriptionSuggestRequest {
  /** The normalized prefix (`normalizeDesc` of what was typed). */
  prefix: string
  /**
   * `YYYY-MM`. Only rows whose budget month is before this one count; every row counts when absent. A budget
   * month and not a day, because the browser holds its rows by budget month (`/transactions/months`): the rows
   * from its oldest month on are its own and the rows before that month are the server's, so the two sides are
   * every row with none in both and none in neither.
   */
  before?: string
  limit: number
  /** The browser's locale, which decides how letters sort; the runtime's own when absent. */
  locale?: string
}

/**
 * What one request answers: the matches, or no matches and `tooBroad` when the prefix matches more than
 * {@link MAX_SUGGEST_KEYS} different descriptions. That is an ordinary answer for a letter or two of typing, not
 * an error: the browser keeps the matches among its own rows and asks again when the person types more.
 */
export interface DescriptionSuggestResult {
  items: DescriptionMatch[]
  tooBroad: boolean
}
