/**
 * A source is a free label for one phone automation, usually one per bank app. It is stored as a column value and
 * echoed on the status screen, so the rule is narrow: lowercase ASCII letters, digits and hyphens, 1 to 32 characters,
 * starting with a letter or digit. That is enough for any bank's name, and it cannot hold a space, a path, a quote, a
 * control character or anything that renders as another word than the one sent. `$` without the `m` flag matches only
 * at the true end of the text, so a trailing newline is refused too.
 */
const SOURCE_WORD = /^[a-z0-9][a-z0-9-]{0,31}$/

/**
 * The word the counters file a person's unreadable requests under. No push can be counted under it, since a source
 * word never starts with a hyphen, and it is not one of the person's sources.
 */
export const MALFORMED_SOURCE = '-'

/**
 * How many different sources one person may ever have counted. A label that is free would otherwise let a leaked key
 * fill the counter table one row per invented word. Eight is a few banks per household with room to spare. Raising it
 * is a one-line change here.
 */
export const MAX_SOURCES_PER_OWNER = 8

export function isSourceWord(value: unknown): value is string {
  return typeof value === 'string' && SOURCE_WORD.test(value)
}

/** Longest App name a push may carry. Bank app names are a word or two. */
export const MAX_APP_NAME_LENGTH = 64

/**
 * The source word for a bank app's name as the phone gives it ("SampleCards", "Bank 24 Online"): lowercased, accents
 * dropped, every run of other characters a hyphen, no hyphen at either end, at most 32 characters. Null when nothing
 * of the name is left, so a name of symbols alone gives no word rather than a made-up one.
 */
export function sourceWordOf(app: string): string | null {
  const word = app
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 32)
    .replace(/-+$/, '')
  return isSourceWord(word) ? word : null
}
