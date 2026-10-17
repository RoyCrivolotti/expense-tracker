/**
 * How autocomplete orders and bounds the descriptions that match a typed prefix, shared by the browser's
 * index (`src/data/descriptionIndex.ts`) and the server's answer for older rows, so that the two cannot
 * drift: the server returns the first `limit` of the order below, and the browser merges those with its own.
 *
 * The order is on the normalized text, not on the label that happens to be newest. Two labels of one
 * description can differ in case or in surrounding spaces, and an order that read the label would put the
 * same description in a different place depending on which row of it is newest, so a match found in older
 * rows and one found in newer rows could not be merged exactly. On the normalized text a description sits
 * in the same place whichever row speaks for it, and the first `limit` of any subset is always among the
 * first `limit` of the whole.
 */

/** The collator autocomplete sorts with: letters compared as their base letters, so "Cafe" and "café" tie. */
export function descriptionCollator(locale?: string): Intl.Collator {
  return new Intl.Collator(locale, { sensitivity: 'base' })
}

/** Whether this runtime has collation data for `locale`; false for text that is not a language tag. */
export function localeIsSupported(locale: string): boolean {
  try {
    return Intl.Collator.supportedLocalesOf([locale]).length > 0
  } catch {
    return false
  }
}

/**
 * Items in autocomplete order: by the collator over their normalized `key`, then by the key itself, so
 * that descriptions the collator calls equal ("cafe", "café") still have one order whatever order they
 * arrive in.
 */
export function inSuggestionOrder<T extends { key: string }>(items: T[], collator: Intl.Collator): T[] {
  return [...items].sort((a, b) => {
    const byLetters = collator.compare(a.key, b.key)
    if (byLetters !== 0) return byLetters
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  })
}

/**
 * The smallest string greater than every string that starts with `prefix`, in the order SQLite compares
 * text (the UTF-8 bytes, which is code point order), or null when there is none. A prefix match is then
 * the range from `prefix` up to, and not including, this.
 */
export function prefixUpperBound(prefix: string): string | null {
  const points = [...prefix]
  while (points.length > 0) {
    let next = points.pop()!.codePointAt(0)! + 1
    if (next === 0xd800) next = 0xe000
    if (next <= 0x10ffff) return points.join('') + String.fromCodePoint(next)
  }
  return null
}
