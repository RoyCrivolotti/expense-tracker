import { skeletonPieces, tokenise } from './shape'
import type { TokenRun } from './shape'
import { currencyAmount, readPushSlots } from './slots'
import type { NumberSlot, Slot } from './slots'

/**
 * Everything the reader makes of one push, from one tokenising, so a position in the slots, the skeleton and the
 * words always means the same token.
 */
export interface PushReading {
  /** The words of the title and then the body, as written. */
  tokens: string[]
  slots: Slot[]
  /**
   * The skeleton, token by token. Not one per word: a number with its marker glued on gives two (`<N> <C>`) and a
   * word that folds to nothing gives none, so a run in it is turned back into words through `origin`.
   */
  skeletonTokens: string[]
  /** For each skeleton token, the index in `tokens` it came from. */
  origin: number[]
  /** The skeleton tokens joined with spaces: what `skeletonOf` gives for the same push. */
  skeleton: string
  /** The masked title: the skeleton tokens that came from the title. Pushes of one template share it. */
  titleSkeleton: string
  /** The number with a currency marker, as `currencyAmount` picks it. Null when the push shows no such amount. */
  currencyAmount: NumberSlot | null
}

export function readPush(title: string, body: string): PushReading {
  const titleTokens = tokenise(title)
  const tokens = [...titleTokens, ...tokenise(body)]
  const slots = readPushSlots(title, body)
  const pieces = skeletonPieces(tokens, slots)
  const skeletonTokens = pieces.flat()
  const origin = pieces.flatMap((piece, index) => piece.map(() => index))
  const titleLength = origin.filter((index) => index < titleTokens.length).length
  return {
    tokens,
    slots,
    skeletonTokens,
    origin,
    skeleton: skeletonTokens.join(' '),
    titleSkeleton: skeletonTokens.slice(0, titleLength).join(' '),
    currencyAmount: currencyAmount(slots),
  }
}

// Brackets and quotes around a span, and the comma or colon a sentence puts after it. A dot is kept: `S.L.` ends in one.
const LEADING = /^[([{"'“‘«]+/u
const TRAILING = /[)\]}"'”’»,;:]+$/u

/**
 * The words of the push a run of its skeleton covers, as written, with the punctuation a sentence puts around a
 * name taken off. Empty for an empty run. A run that starts or ends inside a word with a glued marker takes the
 * whole word.
 */
export function spanText(reading: PushReading, run: TokenRun): string {
  if (run.end <= run.start) return ''
  const first = reading.origin[run.start]
  const last = reading.origin[run.end - 1]
  if (first === undefined || last === undefined) return ''
  return reading.tokens
    .slice(first, last + 1)
    .join(' ')
    .replace(LEADING, '')
    .replace(TRAILING, '')
}
