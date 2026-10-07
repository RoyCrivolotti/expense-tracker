import { arrowDelta, dragPosition, toLocalDelta, type DragSession, type Placement, type Turn } from './cardPlacement'
import { scaleFromDrag, stepScale } from './cardScale'
import { createLayout, type CardElements, type CardLayout } from './floatingCardLayout'
import { attachGesture, type Gesture } from './pointerGesture'
import type { Size } from './useElementSize'

/** How far an arrow key moves the card, and with a held Shift. */
const STEP_PX = 16
const BIG_STEP_PX = 64

/** Dragging by the grip: the card goes as far as the pointer, held inside the box. */
function dragGesture(layout: CardLayout, turn: () => Turn): Gesture<DragSession> {
  return {
    start: (e) => ({
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      start: layout.at(),
      box: layout.box(),
      card: layout.size(),
      turn: turn(),
      dpr: window.devicePixelRatio || 1,
    }),
    move: (session, e) => layout.moveTo(dragPosition(session, e.clientX, e.clientY)),
    // Of the sizes the position was worked out for: after a resize it is the box that was, not the one that is.
    finish: (session) => {
      const at = layout.at()
      if (at.x !== session.start.x || at.y !== session.start.y) layout.remember(session.box, session.card)
    },
  }
}

interface ResizeSession {
  x0: number
  y0: number
  scale: number
  /** The content's size at the scale it began at. */
  content: Size
  turn: Turn
}

/** Dragging the bottom right corner: the whole card grows or shrinks with the pointer, from its top left. */
function resizeGesture(layout: CardLayout, turn: () => Turn): Gesture<ResizeSession> {
  return {
    start: (e) => {
      const scale = layout.scale()
      const own = layout.natural()
      return { x0: e.clientX, y0: e.clientY, scale, content: { width: own.width * scale, height: own.height * scale }, turn: turn() }
    },
    move: (session, e) => {
      const delta = toLocalDelta(e.clientX - session.x0, e.clientY - session.y0, session.turn)
      layout.rescale(scaleFromDrag(session.scale, session.content, delta))
    },
    finish: () => layout.remember(layout.box(), layout.size()),
  }
}

/** Arrow keys on the grip move the card, in the box's own frame. */
function moveKeys(layout: CardLayout) {
  return (e: KeyboardEvent) => {
    const step = arrowDelta(e.key, e.shiftKey ? BIG_STEP_PX : STEP_PX)
    if (!step) return
    e.preventDefault()
    layout.shift(step)
  }
}

/** Arrow keys, plus and minus on the corner make the card larger or smaller. */
function sizeKeys(layout: CardLayout) {
  return (e: KeyboardEvent) => {
    const grow = e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === '+' || e.key === '='
    const shrink = e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === '-'
    if (!grow && !shrink) return
    e.preventDefault()
    layout.rescale(stepScale(layout.scale(), grow ? 1 : -1))
    layout.remember(layout.box(), layout.size())
  }
}

export interface FloatingCardParts extends CardElements {
  /** What a pointer takes to move the card. */
  grip: HTMLElement
  /** What a pointer takes to resize it. */
  corner: HTMLElement
  placement: { current: Placement }
  /** The scale asked for, or null until it has been. */
  choice: { current: number | null }
  turn: () => Turn
}

/**
 * Everything for one floating card, made once and taken away by what it returns: its size and place
 * (before anything is drawn), the gestures that move and resize it, and the observer that puts it
 * back by its share of the room when the box or its content changes size. A resize ends a gesture in
 * hand, which measured sizes that are gone. Nothing here is React state.
 */
export function attachFloatingCard(parts: FloatingCardParts): () => void {
  const { stage, card, content, grip, corner, turn } = parts
  const layout = createLayout(parts, parts.placement, parts.choice)
  const move = attachGesture(grip, card, dragGesture(layout, turn))
  const resize = attachGesture(corner, card, resizeGesture(layout, turn))
  const onMoveKey = moveKeys(layout)
  const onSizeKey = sizeKeys(layout)
  // Not the card itself, which this sets the size of: its content, which is how much it has to say.
  const observer = new ResizeObserver(() => {
    move.end()
    resize.end()
    layout.refresh()
  })

  layout.refresh()
  observer.observe(stage)
  observer.observe(content)
  grip.addEventListener('keydown', onMoveKey)
  corner.addEventListener('keydown', onSizeKey)
  return () => {
    move.detach()
    resize.detach()
    observer.disconnect()
    grip.removeEventListener('keydown', onMoveKey)
    corner.removeEventListener('keydown', onSizeKey)
  }
}
