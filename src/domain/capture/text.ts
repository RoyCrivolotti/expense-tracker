// Control characters and the bidi overrides and isolates that can reorder what a reader sees.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const HIDDEN = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g

/** Bank text is written by strangers; strip what could disguise it before it is shown. */
export function cleanText(text: string): string {
  return text.replace(HIDDEN, '').replace(/\s+/g, ' ').trim()
}

// Cards and accounts are shown masked, with the last four after a star, bullet or ellipsis.
const MASKED_FOUR = /(?:[*•·…]\s?|ending\s+)(\d{4})(?!\d)/gi

/** The last four digits of the card or account a push names, when it names exactly one. */
export function findLastFour(body: string): string | null {
  const found = new Set([...body.matchAll(MASKED_FOUR)].map((m) => m[1] ?? ''))
  return found.size === 1 ? ([...found][0] ?? null) : null
}

/** Case and accent blind form used to compare titles. */
export function foldTitle(title: string): string {
  return title.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}
