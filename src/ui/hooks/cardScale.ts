import type { Point } from './cardPlacement'
import type { Size } from './useElementSize'

/** The smallest a card is made on purpose, by hand; one that has more to say than fits is made smaller than this. */
export const MIN_SCALE = 0.25

/** How much of its box a card takes by default, and at most. Never all of it: it must have room to move. */
const COMFORT = { width: 0.7, height: 0.65 }
const LIMIT = { width: 0.9, height: 0.9 }

/** How much a step of the keys grows or shrinks a card by. */
const STEP = 1.1

interface Share {
  width: number
  height: number
}

/**
 * The scale at which a card of `natural` size, under `chrome` pixels of controls that do not scale,
 * takes `share` of the box in each direction. As large as it can be without going over either.
 */
function fit(box: Size, natural: Size, chrome: number, share: Share): number {
  if (!(natural.width > 0) || !(natural.height > 0)) return 1
  const byWidth = (box.width * share.width) / natural.width
  const byHeight = (box.height * share.height - chrome) / natural.height
  const scale = Math.min(byWidth, byHeight)
  return Number.isFinite(scale) && scale > 0 ? scale : MIN_SCALE
}

/**
 * The scale a card is drawn at. With no choice made it is as large as is comfortable, up to the size
 * it is laid out at, so everything on it is shown whole and text is no smaller than it has to be.
 * With a choice it is that, held between the least that is worth reading and most of the box (which
 * is as large as it may be made, so that it can still be moved), and a card that has more to say than
 * it had is made smaller to keep fitting rather than larger than its box.
 */
export function effectiveScale(choice: number | null, box: Size, natural: Size, chrome: number): number {
  if (choice === null) return Math.min(1, fit(box, natural, chrome, COMFORT))
  const most = fit(box, natural, chrome, LIMIT)
  return Math.min(most, Math.max(MIN_SCALE, choice))
}

/** The size of the card: its content scaled, and the controls above it as they are. */
export function scaledSize(natural: Size, chrome: number, scale: number): Size {
  return { width: natural.width * scale, height: chrome + natural.height * scale }
}

/**
 * The scale a pointer dragging the bottom right corner makes: the movement along the card's diagonal
 * is the growth, so the corner follows the pointer and the card keeps its proportions.
 */
export function scaleFromDrag(scale: number, content: Size, delta: Point): number {
  const along = delta.x * content.width + delta.y * content.height
  const diagonal = content.width * content.width + content.height * content.height
  if (!(diagonal > 0)) return scale
  return Math.max(0, scale * (1 + along / diagonal))
}

/** One step larger or smaller, for the keys. */
export function stepScale(scale: number, direction: 1 | -1): number {
  return direction === 1 ? scale * STEP : scale / STEP
}
