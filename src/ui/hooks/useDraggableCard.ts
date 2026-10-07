import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import type { Size } from './useElementSize'
import {
  arrowDelta,
  clampPx,
  dragPosition,
  onDevicePixels,
  placementToPx,
  pxToPlacement,
  type DragSession,
  type Placement,
  type Point,
  type Turn,
} from './cardPlacement'

/** How far an arrow key moves the card, and a held Shift. */
const STEP_PX = 16
const BIG_STEP_PX = 64

interface Parts {
  /** The box the card moves in. */
  stage: HTMLElement
  /** The card, which only ever has its `transform` written. */
  card: HTMLElement
  /** What a pointer takes hold of. */
  handle: HTMLElement
  placement: { current: Placement }
  turn: () => Turn
}

const boxSize = (el: HTMLElement) => ({ width: el.clientWidth, height: el.clientHeight })
const cardSize = (el: HTMLElement) => ({ width: el.offsetWidth, height: el.offsetHeight })

function write(card: HTMLElement, at: Point) {
  card.style.transform = `translate3d(${at.x}px, ${at.y}px, 0)`
}

/**
 * The listeners and the observer of one card, made once and taken away by what it returns. Nothing
 * here is React state: a move writes the card's transform and nothing else, so a drag renders no
 * component, and what the pointer came down on is measured once and not while it moves, since
 * reading a layout in the middle of a move is what makes a drag stutter.
 */
function attach({ stage, card, handle, placement, turn }: Parts): () => void {
  let session: DragSession | null = null
  let at: Point = { x: 0, y: 0 }

  const settle = (px: Point) => {
    at = clampPx(onDevicePixels(px, window.devicePixelRatio || 1), boxSize(stage), cardSize(card))
    write(card, at)
  }
  const place = () => settle(placementToPx(placement.current, boxSize(stage), cardSize(card)))
  // Of the sizes the position was worked out for: after a resize it is the box that was, not the one that is.
  const remember = (box: Size, size: Size) => {
    placement.current = pxToPlacement(at, box, size, placement.current)
  }

  const onMove = (e: PointerEvent) => {
    if (session?.id !== e.pointerId) return
    at = dragPosition(session, e.clientX, e.clientY)
    write(card, at)
  }
  // One way out for a pointer that lifts, is cancelled or is taken from the handle, and for a resize.
  const end = () => {
    const ended = session
    if (!ended) return
    session = null
    const moved = at.x !== ended.start.x || at.y !== ended.start.y
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', end)
    handle.removeEventListener('pointercancel', end)
    handle.removeEventListener('lostpointercapture', end)
    try {
      handle.releasePointerCapture(ended.id)
    } catch {
      // Already let go of, which is what a lost capture is.
    }
    delete card.dataset.dragging
    if (moved) remember(ended.box, ended.card)
  }
  const onDown = (e: PointerEvent) => {
    if (session || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
    if (e.pointerType !== 'mouse') e.preventDefault()
    session = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      start: at,
      box: boxSize(stage),
      card: cardSize(card),
      turn: turn(),
      dpr: window.devicePixelRatio || 1,
    }
    try {
      handle.setPointerCapture(e.pointerId)
    } catch {
      // Not a pointer that can be captured: the drag then ends with the pointer leaving the handle.
    }
    card.dataset.dragging = 'true'
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', end)
    handle.addEventListener('pointercancel', end)
    handle.addEventListener('lostpointercapture', end)
  }
  const onKey = (e: KeyboardEvent) => {
    const step = arrowDelta(e.key, e.shiftKey ? BIG_STEP_PX : STEP_PX)
    if (!step) return
    e.preventDefault()
    settle({ x: at.x + step.x, y: at.y + step.y })
    remember(boxSize(stage), cardSize(card))
  }
  // A resize, whichever it is (the card has more to say, the box lost the rail, the phone turned):
  // the drag in hand was measured for sizes that are gone, so it ends, and the card is put where its
  // placement says it is, before the browser paints.
  const observer = new ResizeObserver(() => {
    end()
    place()
  })

  place()
  observer.observe(stage)
  observer.observe(card)
  handle.addEventListener('pointerdown', onDown)
  handle.addEventListener('keydown', onKey)
  return () => {
    end()
    observer.disconnect()
    handle.removeEventListener('pointerdown', onDown)
    handle.removeEventListener('keydown', onKey)
  }
}

/**
 * Lets a card be moved about a box by dragging its handle or with the arrow keys, kept wholly
 * inside the box, and put back where it was when either changes size. The card is placed by a
 * share of the room it has (`placement`, which the caller keeps and which this updates as the card
 * is moved), and is positioned by its `transform` alone, so whatever animates it must be a
 * different element. `frozen` leaves a card where it is while it leaves.
 */
export function useDraggableCard({
  stage,
  card,
  handle,
  placement,
  turn,
  frozen,
}: {
  stage: RefObject<HTMLElement | null>
  card: RefObject<HTMLElement | null>
  handle: RefObject<HTMLElement | null>
  placement: RefObject<Placement>
  turn: Turn
  frozen: boolean
}): void {
  // Read when a drag starts, so a phone turning does not take the listeners down.
  const turnNow = useRef(turn)
  useEffect(() => {
    turnNow.current = turn
  }, [turn])

  useLayoutEffect(() => {
    const stageEl = stage.current
    const cardEl = card.current
    const handleEl = handle.current
    if (frozen || !stageEl || !cardEl || !handleEl) return
    return attach({ stage: stageEl, card: cardEl, handle: handleEl, placement, turn: () => turnNow.current })
  }, [stage, card, handle, placement, frozen])
}
