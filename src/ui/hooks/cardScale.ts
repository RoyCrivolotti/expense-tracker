import type { Point } from './cardPlacement'
import type { Size } from './useElementSize'

/** The smallest a card is made on purpose, by hand; one that has more to say than fits is made smaller than this. */
export const MIN_SCALE = 0.25

/** How much of its box a card takes by default, and at most. Never all of it: it must have room to move. */
const COMFORT = { width: 0.8, height: 0.65 }
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

/**
 * What a row of a legend takes at the size it is laid out at, and what the card has besides its
 * rows: estimates in pixels, with a name that wraps to two lines, so that a card with more rows than
 * a short, wide box can hold in a column is laid out in more of them before it is scaled.
 */
const ROW = { width: 240, gap: 16, height: 38 }
const BESIDES = { width: 20, height: 30 }
const MOST_COLUMNS = 4

/**
 * How many columns to lay `rows` out in so that the card, drawn as large as is comfortable in `box`,
 * has the largest text: more of them while that makes the card wider and no taller than the box can
 * show at a larger scale, and never more than it gains from. `chrome` is the bar above the rows. A
 * box that is not measured gets one column.
 */
export function legendColumns(rows: number, box: Size, chrome: number): number {
  if (!(box.width > 0) || !(box.height > 0) || rows < 2) return 1
  let best = 1
  let bestScale = 0
  for (let columns = 1; columns <= Math.min(rows, MOST_COLUMNS); columns++) {
    const natural = {
      width: columns * ROW.width + (columns - 1) * ROW.gap + BESIDES.width,
      height: Math.ceil(rows / columns) * ROW.height + BESIDES.height,
    }
    // Drawn at its natural size at most, so a column that only makes room that is not used is not one.
    const scale = Math.min(1, fit(box, natural, chrome, COMFORT))
    if (scale > bestScale + 0.001) {
      best = columns
      bestScale = scale
    }
  }
  return best
}
