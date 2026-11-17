// Control characters and the bidi overrides and isolates that can reorder what a reader sees.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const HIDDEN = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g

/** Bank text is written by strangers; strip what could disguise it before it is shown. */
export function cleanText(text: string): string {
  return text.replace(HIDDEN, '').replace(/\s+/g, ' ').trim()
}

/** Case and accent blind form used to compare titles. */
export function foldTitle(title: string): string {
  return title.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// What a bank puts around a word or number without it being part of it: opening brackets and quotes in
// front, closing ones and sentence punctuation behind. A leading dot or comma is kept (".5" is not "5").
const LEADING_EDGE = /^[([{"'“‘«<¿¡]+/u
const TRAILING_EDGE = /[)\]}"'”’»>;:!?,.]+$/u

/** A token without the brackets, quotes and sentence punctuation stuck to its ends. */
export function trimEdges(token: string): string {
  return token.replace(LEADING_EDGE, '').replace(TRAILING_EDGE, '')
}
