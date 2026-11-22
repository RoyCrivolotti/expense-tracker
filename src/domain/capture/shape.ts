import { gluedMarker, isMarkerToken, splitNumberToken } from './currency'
import type { Slot } from './slots'
import { cleanText, foldTitle } from './text'

/**
 * The words of a push as the reader sees them: cleaned, then split on whitespace. Punctuation stays on the
 * token it is stuck to, so a token's position is the same however the text is spelt around it.
 */
export function tokenise(text: string): string[] {
  const cleaned = cleanText(text)
  return cleaned ? cleaned.split(' ') : []
}

/** What each kind of slot becomes in a skeleton. `<C>` is a currency marker standing alone, `<M>` a merchant span. */
const PLACEHOLDER = { number: '<N>', 'masked-digits': '<D>', date: '<DATE>', code: '<CODE>' } as const
const CURRENCY_PLACEHOLDER = '<C>'
/** Any other token with a digit in it: a time, a reference, a percentage. */
const OTHER_NUMBER_PLACEHOLDER = '<X>'
export const WILDCARD = '<M>'
const PLACEHOLDERS: ReadonlySet<string> = new Set([
  ...Object.values(PLACEHOLDER),
  CURRENCY_PLACEHOLDER,
  OTHER_NUMBER_PLACEHOLDER,
  WILDCARD,
])

/** A number with its marker glued on is written as the marker and the number apart, as `50 EUR` is, so the spelling does not change the shape. */
function numberPlaceholder(token: string): string[] {
  const parts = splitNumberToken(token)
  const marker = parts && gluedMarker(parts) ? CURRENCY_PLACEHOLDER : null
  if (!marker || !parts) return [PLACEHOLDER.number]
  return parts.prefix ? [marker, PLACEHOLDER.number] : [PLACEHOLDER.number, marker]
}

/** What one token of a push becomes in the skeleton: usually one token, two for a number with a glued marker, none for a token that folds to nothing. */
function pieceOf(
  token: string,
  kind: Slot['kind'] | undefined,
): string[] {
  if (kind === 'number') return numberPlaceholder(token)
  if (kind) return [PLACEHOLDER[kind]]
  if (isMarkerToken(token)) return [CURRENCY_PLACEHOLDER]
  if (/\d/.test(token)) return [OTHER_NUMBER_PLACEHOLDER]
  const folded = foldTitle(token)
  return folded === '' ? [] : [folded]
}

/** The skeleton of each token in turn, so a caller can tell which token of the push each skeleton token came from. */
export function skeletonPieces(
  tokens: readonly string[],
  slots: readonly Slot[],
): string[][] {
  const byIndex = new Map(slots.map((slot) => [slot.index, slot.kind]))
  return tokens.map((token, index) => pieceOf(token, byIndex.get(index)))
}

/**
 * The shape of a push: its title and body folded to lower case without accents, with every slot, every
 * currency marker and every other token that holds a digit (`09:41`, `ref12`, `10%`) replaced by a
 * placeholder, joined with single spaces. Two pushes the bank wrote from one template give one skeleton
 * whatever the amounts, cards, dates, currencies, spacing of the marker and any other number.
 * `slots` must come from `readPushSlots(title, body)`, so their positions match the tokens used here.
 */
export function skeletonOf(
  title: string,
  body: string,
  slots: readonly Slot[],
): string {
  return skeletonPieces([...tokenise(title), ...tokenise(body)], slots)
    .flat()
    .join(' ')
}

/**
 * Names a shape: the SHA-256 of the source and skeleton, each length-prefixed as in `replayKey` so no text
 * can move from one to the other. The source is part of it because two banks can write the same words and
 * mean different things.
 */
export async function shapeId(
  source: string,
  skeleton: string,
): Promise<string> {
  const joined = [source, skeleton].map((part) => `${part.length}:${part}`).join('|')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(joined))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** A run of tokens, `end` exclusive. */
export interface TokenRun {
  start: number
  end: number
}

/** Where two skeletons differ: the run of each that is not shared with the other. */
export interface SiblingRuns {
  a: TokenRun
  b: TokenRun
}

/** The longest a varying run may be. A merchant or a name is a few words; more means the texts are two other things. */
export const MAX_SIBLING_RUN = 8

/** Words, not placeholders, two skeletons must share before they count as one template. */
export const MIN_SHARED_WORDS = 3

/**
 * Where two skeletons differ. What they share at the start and at the end is the template, and what is
 * left in the middle of each is the part that varies, usually the merchant. The two middles may differ in
 * length (one word against four) and one may be empty (a push with no merchant), but not both: equal
 * skeletons are not siblings. Two texts that merely look alike give null: the shared start and end must
 * cover half of the shorter one, hold at least `MIN_SHARED_WORDS` tokens that are not placeholders (two
 * pushes of `<N> <C>` and one word are not a template), and neither middle may pass `MAX_SIBLING_RUN`.
 */
export function siblingSlot(
  a: readonly string[],
  b: readonly string[],
): SiblingRuns | null {
  const shorter = Math.min(a.length, b.length)
  let prefix = 0
  while (prefix < shorter && a[prefix] === b[prefix]) prefix++
  let suffix = 0
  while (suffix < shorter - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++

  const runs = { a: { start: prefix, end: a.length - suffix }, b: { start: prefix, end: b.length - suffix } }
  const longest = Math.max(runs.a.end - runs.a.start, runs.b.end - runs.b.start)
  if (longest === 0 || longest > MAX_SIBLING_RUN || (prefix + suffix) * 2 < shorter) return null
  const shared = [...a.slice(0, prefix), ...a.slice(a.length - suffix)]
  return shared.filter((token) => !PLACEHOLDERS.has(token)).length < MIN_SHARED_WORDS ? null : runs
}

/** The tokens with `run` replaced by one wildcard, so the template no longer holds what varied. */
export function withWildcard(
  tokens: readonly string[],
  run: TokenRun,
): string[] {
  return [...tokens.slice(0, run.start), WILDCARD, ...tokens.slice(run.end)]
}
