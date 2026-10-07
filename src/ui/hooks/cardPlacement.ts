import type { Size } from './useElementSize'

export interface Point {
  x: number
  y: number
}

/**
 * Where a card sits in the box it can be moved in, as a share of the room it has on each axis: 0 is
 * against the start, 1 against the end. Not pixels, so that when the box or the card changes size
 * a card that was in the lower right corner is still in it.
 */
export type Placement = Point

/** How many quarter turns clockwise the box is drawn by an ancestor's transform. */
export type Turn = 0 | 1

export const LOWER_RIGHT: Placement = { x: 1, y: 1 }

/** The room a card has to move in: what the box has left over, never below nothing. */
export function room(box: Size, card: Size): Size {
  const left = (box: number, card: number) => (Number.isFinite(box - card) ? Math.max(0, box - card) : 0)
  return { width: left(box.width, card.width), height: left(box.height, card.height) }
}

/** The pixel position of a placement. */
export function placementToPx(placement: Placement, box: Size, card: Size): Point {
  const free = room(box, card)
  return { x: placement.x * free.width, y: placement.y * free.height }
}

/**
 * The placement of a pixel position. An axis with no room says nothing about where along it the
 * card was, so it keeps what it had: dividing by nothing would otherwise throw away the corner it
 * was in the moment the box gets room again.
 */
export function pxToPlacement(px: Point, box: Size, card: Size, previous: Placement): Placement {
  const free = room(box, card)
  const share = (value: number, span: number, before: number) =>
    span > 0 ? Math.min(1, Math.max(0, value / span)) : before
  return { x: share(px.x, free.width, previous.x), y: share(px.y, free.height, previous.y) }
}

/** A position held inside the box: a card larger than its box sits at the start, not outside it. */
export function clampPx(px: Point, box: Size, card: Size): Point {
  const free = room(box, card)
  const within = (value: number, span: number) => (Number.isFinite(value) ? Math.min(span, Math.max(0, value)) : 0)
  return { x: within(px.x, free.width), y: within(px.y, free.height) }
}

/**
 * A pointer's movement on the screen as movement in the box's own frame. Turned a quarter turn
 * clockwise, the box's x runs down the screen and its y runs to the left.
 */
export function toLocalDelta(dxScreen: number, dyScreen: number, turn: Turn): Point {
  return turn === 1 ? { x: dyScreen, y: 0 - dxScreen } : { x: dxScreen, y: dyScreen }
}

/** Whole device pixels: a card between two of them has its text drawn blurred. */
export function onDevicePixels(px: Point, ratio: number): Point {
  if (!(ratio > 0)) return px
  return { x: Math.round(px.x * ratio) / ratio, y: Math.round(px.y * ratio) / ratio }
}

/** The step an arrow key moves a card by, in the box's frame; null for any other key. */
export function arrowDelta(key: string, step: number): Point | null {
  switch (key) {
    case 'ArrowLeft':
      return { x: -step, y: 0 }
    case 'ArrowRight':
      return { x: step, y: 0 }
    case 'ArrowUp':
      return { x: 0, y: -step }
    case 'ArrowDown':
      return { x: 0, y: step }
    default:
      return null
  }
}

/** Everything a drag needs, read once when the pointer comes down and not again while it moves. */
export interface DragSession {
  id: number
  /** Where the pointer came down, on the screen. */
  x0: number
  y0: number
  /** The card's position when it did. */
  start: Point
  box: Size
  card: Size
  turn: Turn
  /** Device pixels to a CSS pixel. */
  dpr: number
}

/**
 * Where the card goes for a pointer at (clientX, clientY). Measured from where the pointer came
 * down and not from the last move, so a card held at an edge while the pointer goes on past it comes
 * away exactly when the pointer comes back to where it would have been.
 */
export function dragPosition(session: DragSession, clientX: number, clientY: number): Point {
  const delta = toLocalDelta(clientX - session.x0, clientY - session.y0, session.turn)
  const wanted = { x: session.start.x + delta.x, y: session.start.y + delta.y }
  return clampPx(onDevicePixels(wanted, session.dpr), session.box, session.card)
}
