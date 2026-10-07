import { act, fireEvent, render, screen } from '@testing-library/react'
import { Profiler, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resizeObservers } from '../../test/setup'
import { LOWER_RIGHT, type Placement, type Turn } from './cardPlacement'
import { useDraggableCard } from './useDraggableCard'

/** The box is 400 x 300 and the card 100 x 60, so the card has 300 x 240 to move in. */
const sizes = { box: { width: 400, height: 300 }, card: { width: 100, height: 60 } }
const placement: { current: Placement } = { current: { ...LOWER_RIGHT } }

beforeEach(() => {
  sizes.box = { width: 400, height: 300 }
  sizes.card = { width: 100, height: 60 }
  placement.current = { ...LOWER_RIGHT }
  Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true })
  Object.defineProperty(Element.prototype, 'setPointerCapture', { value: vi.fn(), configurable: true })
  Object.defineProperty(Element.prototype, 'releasePointerCapture', { value: vi.fn(), configurable: true })
})

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, 'setPointerCapture')
  Reflect.deleteProperty(Element.prototype, 'releasePointerCapture')
})

function Harness({ turn = 0, frozen = false }: { turn?: Turn; frozen?: boolean }) {
  const stage = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const handle = useRef<HTMLButtonElement>(null)
  // jsdom lays nothing out, so the sizes the hook reads are planted when the elements arrive.
  const plantStage = (el: HTMLDivElement | null) => {
    if (el) {
      Object.defineProperty(el, 'clientWidth', { get: () => sizes.box.width, configurable: true })
      Object.defineProperty(el, 'clientHeight', { get: () => sizes.box.height, configurable: true })
    }
    stage.current = el
  }
  const plantCard = (el: HTMLDivElement | null) => {
    if (el) {
      Object.defineProperty(el, 'offsetWidth', { get: () => sizes.card.width, configurable: true })
      Object.defineProperty(el, 'offsetHeight', { get: () => sizes.card.height, configurable: true })
    }
    card.current = el
  }
  useDraggableCard({ stage, card, handle, placement, turn, frozen })
  return (
    <div ref={plantStage}>
      <div ref={plantCard} data-testid="card">
        <button ref={handle} type="button">
          Move
        </button>
      </div>
    </div>
  )
}

const card = () => screen.getByTestId('card')
const handle = () => screen.getByRole('button', { name: 'Move' })
const at = () => card().style.transform
const touch = (clientX: number, clientY: number, over = {}) => ({
  clientX,
  clientY,
  pointerId: 1,
  pointerType: 'touch',
  isPrimary: true,
  ...over,
})
const resize = () => act(() => resizeObservers.at(-1)?.trigger())

describe('useDraggableCard placing', () => {
  it('puts the card in the lower right corner, before anything is drawn', () => {
    render(<Harness />)
    expect(at()).toBe('translate3d(300px, 240px, 0)')
  })

  it('keeps a corner when the box grows, and when the card does', () => {
    render(<Harness />)
    sizes.box = { width: 600, height: 300 }
    resize()
    expect(at()).toBe('translate3d(500px, 240px, 0)')
    sizes.card = { width: 100, height: 100 }
    resize()
    expect(at()).toBe('translate3d(500px, 200px, 0)')
  })

  it('puts a card in a box with no room at the start of it', () => {
    sizes.box = { width: 0, height: 0 }
    render(<Harness />)
    expect(at()).toBe('translate3d(0px, 0px, 0)')
  })

  it('rounds to a device pixel', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true })
    placement.current = { x: 0.5, y: 0.5 }
    sizes.box = { width: 401, height: 300 }
    render(<Harness />)
    // Half of the 301px it has is 150.5: a whole device pixel at a ratio of two.
    expect(at()).toBe('translate3d(150.5px, 120px, 0)')
  })

  it('leaves a frozen card where it is, and does not listen to it', () => {
    const { rerender } = render(<Harness />)
    rerender(<Harness frozen />)
    fireEvent.pointerDown(handle(), touch(0, 0))
    fireEvent.pointerMove(handle(), touch(100, 100))
    expect(at()).toBe('translate3d(300px, 240px, 0)')
  })

  it('stops watching and listening when it goes', () => {
    const { unmount } = render(<Harness />)
    expect(resizeObservers).toHaveLength(1)
    unmount()
    expect(resizeObservers).toHaveLength(0)
  })
})

describe('useDraggableCard dragging', () => {
  beforeEach(() => {
    placement.current = { x: 0.5, y: 0.5 }
  })

  it('moves the card as far as the pointer, and no further past the edges', () => {
    render(<Harness />)
    expect(at()).toBe('translate3d(150px, 120px, 0)')
    fireEvent.pointerDown(handle(), touch(500, 400))
    expect(card().dataset.dragging).toBe('true')
    fireEvent.pointerMove(handle(), touch(530, 385))
    expect(at()).toBe('translate3d(180px, 105px, 0)')
    fireEvent.pointerMove(handle(), touch(2000, -2000))
    expect(at()).toBe('translate3d(300px, 0px, 0)')
    fireEvent.pointerMove(handle(), touch(530, 385))
    expect(at()).toBe('translate3d(180px, 105px, 0)')
  })

  it('reads a box turned a quarter turn from the screen\'s other axis', () => {
    render(<Harness turn={1} />)
    fireEvent.pointerDown(handle(), touch(500, 400))
    fireEvent.pointerMove(handle(), touch(490, 420))
    expect(at()).toBe('translate3d(170px, 130px, 0)')
  })

  it('renders nothing while it moves: not a component, not once', () => {
    let commits = 0
    render(
      <Profiler id="drag" onRender={() => (commits += 1)}>
        <Harness />
      </Profiler>,
    )
    const before = commits
    fireEvent.pointerDown(handle(), touch(500, 400))
    for (let i = 1; i <= 120; i++) fireEvent.pointerMove(handle(), touch(500 + i, 400 - i / 2))
    fireEvent.pointerUp(handle(), touch(620, 340))
    expect(commits).toBe(before)
  })

  it('keeps where it was left as a share of its room, once the pointer lifts', () => {
    render(<Harness />)
    fireEvent.pointerDown(handle(), touch(500, 400))
    fireEvent.pointerMove(handle(), touch(530, 385))
    expect(placement.current).toEqual({ x: 0.5, y: 0.5 })
    fireEvent.pointerUp(handle(), touch(530, 385))
    expect(placement.current).toEqual({ x: 180 / 300, y: 105 / 240 })
    expect(card().dataset.dragging).toBeUndefined()
    // And it stays there when the box changes size.
    sizes.box = { width: 700, height: 300 }
    resize()
    expect(at()).toBe('translate3d(360px, 105px, 0)')
  })

  it('leaves a tap where it was, and keeps the share it had', () => {
    render(<Harness />)
    fireEvent.pointerDown(handle(), touch(500, 400))
    fireEvent.pointerUp(handle(), touch(500, 400))
    expect(placement.current).toEqual({ x: 0.5, y: 0.5 })
    expect(at()).toBe('translate3d(150px, 120px, 0)')
  })

  it('follows one pointer only, and only a primary one', () => {
    render(<Harness />)
    fireEvent.pointerDown(handle(), touch(500, 400, { isPrimary: false }))
    fireEvent.pointerMove(handle(), touch(530, 385))
    expect(at()).toBe('translate3d(150px, 120px, 0)')

    fireEvent.pointerDown(handle(), touch(500, 400))
    fireEvent.pointerDown(handle(), touch(0, 0, { pointerId: 2 }))
    fireEvent.pointerMove(handle(), touch(530, 385, { pointerId: 2 }))
    expect(at()).toBe('translate3d(150px, 120px, 0)')
    fireEvent.pointerMove(handle(), touch(530, 385))
    expect(at()).toBe('translate3d(180px, 105px, 0)')
  })

  it('takes a mouse only by its main button', () => {
    render(<Harness />)
    fireEvent.pointerDown(handle(), touch(500, 400, { pointerType: 'mouse', button: 2 }))
    fireEvent.pointerMove(handle(), touch(530, 385, { pointerType: 'mouse' }))
    expect(at()).toBe('translate3d(150px, 120px, 0)')
    fireEvent.pointerDown(handle(), touch(500, 400, { pointerType: 'mouse', button: 0 }))
    fireEvent.pointerMove(handle(), touch(530, 385, { pointerType: 'mouse' }))
    expect(at()).toBe('translate3d(180px, 105px, 0)')
  })

  it.each(['pointercancel', 'lostpointercapture'])('lets go on %s', (type) => {
    render(<Harness />)
    fireEvent.pointerDown(handle(), touch(500, 400))
    fireEvent.pointerMove(handle(), touch(530, 385))
    fireEvent(handle(), new Event(type))
    expect(card().dataset.dragging).toBeUndefined()
    fireEvent.pointerMove(handle(), touch(100, 100))
    expect(at()).toBe('translate3d(180px, 105px, 0)')
    expect(placement.current.x).toBeCloseTo(0.6)
  })

  it('ends a drag at a resize, which it measured for sizes that are gone, and puts the card by its share', () => {
    render(<Harness />)
    fireEvent.pointerDown(handle(), touch(500, 400))
    fireEvent.pointerMove(handle(), touch(530, 385))
    sizes.box = { width: 700, height: 300 }
    resize()
    expect(at()).toBe('translate3d(360px, 105px, 0)')
    fireEvent.pointerMove(handle(), touch(100, 100))
    expect(at()).toBe('translate3d(360px, 105px, 0)')
  })

  it('does not throw where a pointer cannot be captured', () => {
    Object.defineProperty(Element.prototype, 'setPointerCapture', {
      value: () => {
        throw new Error('no such pointer')
      },
      configurable: true,
    })
    render(<Harness />)
    fireEvent.pointerDown(handle(), touch(500, 400))
    fireEvent.pointerMove(handle(), touch(530, 385))
    expect(at()).toBe('translate3d(180px, 105px, 0)')
  })
})

describe('useDraggableCard keys', () => {
  beforeEach(() => {
    placement.current = { x: 0.5, y: 0.5 }
  })

  it('moves a step for an arrow, four for an arrow with Shift, and not past an edge', () => {
    render(<Harness />)
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' })
    expect(at()).toBe('translate3d(134px, 120px, 0)')
    fireEvent.keyDown(handle(), { key: 'ArrowDown', shiftKey: true })
    expect(at()).toBe('translate3d(134px, 184px, 0)')
    fireEvent.keyDown(handle(), { key: 'ArrowRight', shiftKey: true })
    fireEvent.keyDown(handle(), { key: 'ArrowRight', shiftKey: true })
    fireEvent.keyDown(handle(), { key: 'ArrowRight', shiftKey: true })
    fireEvent.keyDown(handle(), { key: 'ArrowRight', shiftKey: true })
    expect(at()).toBe('translate3d(300px, 184px, 0)')
    fireEvent.keyDown(handle(), { key: 'ArrowUp', shiftKey: true })
    fireEvent.keyDown(handle(), { key: 'ArrowUp', shiftKey: true })
    fireEvent.keyDown(handle(), { key: 'ArrowUp', shiftKey: true })
    expect(at()).toBe('translate3d(300px, 0px, 0)')
  })

  it('keeps where a key left it, and ignores every other key', () => {
    render(<Harness />)
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' })
    expect(placement.current).toEqual({ x: 134 / 300, y: 0.5 })
    const notHandled = fireEvent.keyDown(handle(), { key: 'a' })
    expect(notHandled).toBe(true)
    expect(at()).toBe('translate3d(134px, 120px, 0)')
  })

  it('stops the page scrolling for the arrow it takes', () => {
    render(<Harness />)
    expect(fireEvent.keyDown(handle(), { key: 'ArrowUp' })).toBe(false)
  })
})
