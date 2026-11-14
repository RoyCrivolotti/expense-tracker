/**
 * A source is a free label for one phone automation, usually one per bank app. It is typed by hand into a Shortcut,
 * stored as a column value and echoed on the status screen, so the rule is narrow: lowercase ASCII letters, digits and
 * hyphens, 1 to 32 characters. That is enough for any bank's name, and it cannot hold a space, a path, a quote, a
 * control character or anything that renders as another word than the one typed. `$` without the `m` flag matches only
 * at the true end of the text, so a trailing newline is refused too.
 */
const SOURCE_WORD = /^[a-z0-9-]{1,32}$/

/**
 * How many different sources one person may ever have counted. A label that is free would otherwise let a leaked key
 * fill the counter table one row per invented word. Eight is a few banks per household with room to spare. Raising it
 * is a one-line change here.
 */
export const MAX_SOURCES_PER_OWNER = 8

export function isSourceWord(value: unknown): value is string {
  return typeof value === 'string' && SOURCE_WORD.test(value)
}
