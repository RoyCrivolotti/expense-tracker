import { describe, expect, it } from 'vitest'
import {
  LOWER_RIGHT,
  arrowDelta,
  clampPx,
  dragPosition,
  onDevicePixels,
  placementToPx,
  pxToPlacement,
  room,
  toLocalDelta,
  type DragSession,
} from './cardPlacement'

const box = { width: 400, height: 300 }
const card = { width: 100, height: 60 }

describe('room', () => {
  it('is what the box has left over', () => {
    expect(room(box, card)).toEqual({ width: 300, height: 240 })
  })

  it('is nothing for a card as large as, or larger than, its box', () => {
    expect(room(box, { width: 400, height: 500 })).toEqual({ width: 0, height: 0 })
  })

  it('is nothing for a size that is not a number', () => {
    expect(room({ width: Number.NaN, height: 300 }, card)).toEqual({ width: 0, height: 240 })
  })
})

describe('placement and pixels', () => {
  it('puts the lower right corner at the far end of the room on both axes', () => {
    expect(placementToPx(LOWER_RIGHT, box, card)).toEqual({ x: 300, y: 240 })
    expect(placementToPx({ x: 0, y: 0 }, box, card)).toEqual({ x: 0, y: 0 })
    expect(placementToPx({ x: 0.5, y: 0.25 }, box, card)).toEqual({ x: 150, y: 60 })
  })

  it('keeps a corner when the box grows, which pixels would not', () => {
    const wider = { width: 800, height: 300 }
    expect(placementToPx(LOWER_RIGHT, wider, card).x).toBe(700)
  })

  it('turns pixels back into the share of the room', () => {
    expect(pxToPlacement({ x: 150, y: 60 }, box, card, LOWER_RIGHT)).toEqual({ x: 0.5, y: 0.25 })
  })

  it('holds a share to between nothing and all of the room', () => {
    expect(pxToPlacement({ x: -40, y: 900 }, box, card, LOWER_RIGHT)).toEqual({ x: 0, y: 1 })
  })

  it('keeps the share it had on an axis that has no room, rather than dividing by nothing', () => {
    const tall = { width: 100, height: 300 }
    expect(pxToPlacement({ x: 0, y: 120 }, tall, card, { x: 0.7, y: 0.1 })).toEqual({ x: 0.7, y: 0.5 })
  })
})

describe('clampPx', () => {
  it('holds a position inside the box on every edge', () => {
    expect(clampPx({ x: -5, y: -5 }, box, card)).toEqual({ x: 0, y: 0 })
    expect(clampPx({ x: 999, y: 999 }, box, card)).toEqual({ x: 300, y: 240 })
    expect(clampPx({ x: 120, y: 80 }, box, card)).toEqual({ x: 120, y: 80 })
  })

  it('puts a card larger than its box at the start of it, and never at a negative position', () => {
    expect(clampPx({ x: 50, y: 50 }, { width: 80, height: 40 }, card)).toEqual({ x: 0, y: 0 })
  })

  it('puts a position that is not a number at the start', () => {
    expect(clampPx({ x: Number.NaN, y: Infinity }, box, card)).toEqual({ x: 0, y: 0 })
  })
})

describe('toLocalDelta', () => {
  it('is the screen movement itself when the box is not turned', () => {
    expect(toLocalDelta(7, -3, 0)).toEqual({ x: 7, y: -3 })
  })

  it('swaps the axes of a box turned a quarter turn clockwise: down the screen is along it, left is down it', () => {
    expect(toLocalDelta(0, 10, 1)).toEqual({ x: 10, y: 0 })
    expect(toLocalDelta(-10, 0, 1)).toEqual({ x: 0, y: 10 })
    expect(toLocalDelta(4, 9, 1)).toEqual({ x: 9, y: -4 })
  })
})

describe('onDevicePixels', () => {
  it('rounds to a whole device pixel', () => {
    expect(onDevicePixels({ x: 10.3, y: 10.8 }, 1)).toEqual({ x: 10, y: 11 })
    expect(onDevicePixels({ x: 10.3, y: 10.8 }, 2)).toEqual({ x: 10.5, y: 11 })
    expect(onDevicePixels({ x: 1, y: 1.1 }, 3)).toEqual({ x: 1, y: 1 })
  })

  it('leaves a position alone for a ratio that makes no sense', () => {
    expect(onDevicePixels({ x: 1.23, y: 4.56 }, 0)).toEqual({ x: 1.23, y: 4.56 })
    expect(onDevicePixels({ x: 1.23, y: 4.56 }, Number.NaN)).toEqual({ x: 1.23, y: 4.56 })
  })

  it('rounds to a third at a ratio of three', () => {
    expect(onDevicePixels({ x: 0.5, y: 0 }, 3).x).toBeCloseTo(2 / 3, 10)
  })
})

describe('arrowDelta', () => {
  it('steps each way for its arrow, and for no other key', () => {
    expect(arrowDelta('ArrowLeft', 16)).toEqual({ x: -16, y: 0 })
    expect(arrowDelta('ArrowRight', 16)).toEqual({ x: 16, y: 0 })
    expect(arrowDelta('ArrowUp', 16)).toEqual({ x: 0, y: -16 })
    expect(arrowDelta('ArrowDown', 64)).toEqual({ x: 0, y: 64 })
    expect(arrowDelta('Enter', 16)).toBeNull()
  })
})

describe('dragPosition', () => {
  const session = (over: Partial<DragSession> = {}): DragSession => ({
    id: 1,
    x0: 500,
    y0: 400,
    start: { x: 100, y: 100 },
    box,
    card,
    turn: 0,
    dpr: 1,
    ...over,
  })

  it('moves the card as far as the pointer has moved', () => {
    expect(dragPosition(session(), 530, 385)).toEqual({ x: 130, y: 85 })
  })

  it('holds the card at the edge while the pointer goes on, and brings it away only when the pointer is back', () => {
    const s = session()
    expect(dragPosition(s, 1500, 400)).toEqual({ x: 300, y: 100 })
    // Back to 200px right of where it came down: the card is 200px from where it started, not at the edge.
    expect(dragPosition(s, 700, 400)).toEqual({ x: 300, y: 100 })
    expect(dragPosition(s, 650, 400)).toEqual({ x: 250, y: 100 })
  })

  it('reads a turned box from the screen\'s other axis', () => {
    const s = session({ turn: 1 })
    // 20px down the screen is 20px along the box; 10px to the left of it is 10px down the box.
    expect(dragPosition(s, 490, 420)).toEqual({ x: 120, y: 110 })
  })

  it('rounds a position inside the box to a device pixel', () => {
    const at = dragPosition(session({ dpr: 2.625, start: { x: 100.1, y: 50 } }), 500, 400)
    expect((at.x * 2.625) % 1).toBeCloseTo(0, 6)
  })

  it('holds a rounded position inside the box, so rounding cannot take it past the edge', () => {
    const at = dragPosition(session({ dpr: 2.625, start: { x: 299.9, y: 0 } }), 500.4, 400)
    expect(at.x).toBe(300)
  })
})
