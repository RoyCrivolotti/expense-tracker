import { act, fireEvent, render, screen } from '@testing-library/react'
import { Profiler, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resizeObservers } from '../../test/setup'
import { LOWER_RIGHT, type Placement, type Turn } from './cardPlacement'
import { useFloatingCard } from './useFloatingCard'

/**
 * The box is 800 x 400. The card's content is laid out at 200 x 100 under a bar 40 tall, so at its own
 * size the card is 200 x 140 and has 600 x 260 to move in.
 */
const sizes = { box: { width: 800, height: 400 }, content: { width: 200, height: 100 } }
const placement: { current: Placement } = { current: { ...LOWER_RIGHT } }
const choice: { current: number | null } = { current: null }

beforeEach(() => {
  sizes.box = { width: 800, height: 400 }
  sizes.content = { width: 200, height: 100 }
  placement.current = { ...LOWER_RIGHT }
  choice.current = null
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
  const bar = useRef<HTMLDivElement>(null)
  const foot = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const grip = useRef<HTMLButtonElement>(null)
  const corner = useRef<HTMLButtonElement>(null)
  useFloatingCard({ stage, card, bar, foot, content, grip, corner, placement, choice, turn, frozen })
  // jsdom lays nothing out, so the sizes the hook reads are planted when the elements arrive.
  const plant = (el: HTMLElement | null, sizeOf: () => { width?: number; height: number }, keys: [string, string]) => {
    if (!el) return
    Object.defineProperty(el, keys[0], { get: () => sizeOf().width, configurable: true })
    Object.defineProperty(el, keys[1], { get: () => sizeOf().height, configurable: true })
  }
  return (
    <div
      ref={(el) => {
        plant(el, () => sizes.box, ['clientWidth', 'clientHeight'])
        stage.current = el
      }}
    >
      <div ref={card} data-testid="card">
        <div
          ref={(el) => {
            if (el) Object.defineProperty(el, 'offsetHeight', { value: 40, configurable: true })
            bar.current = el
          }}
        >
          <button ref={grip} type="button">
            Move
          </button>
        </div>
        <div
          ref={(el) => {
            plant(el, () => sizes.content, ['offsetWidth', 'offsetHeight'])
            content.current = el
          }}
          data-testid="content"
        />
        <div ref={foot} />
        <button ref={corner} type="button">
          Size
        </button>
      </div>
    </div>
  )
}

const card = () => screen.getByTestId('card')
const content = () => screen.getByTestId('content')
const grip = () => screen.getByRole('button', { name: 'Move' })
const corner = () => screen.getByRole('button', { name: 'Size' })
const at = () => card().style.transform
const wide = () => card().style.width
const high = () => card().style.height
const touch = (clientX: number, clientY: number, over = {}) => ({
  clientX,
  clientY,
  pointerId: 1,
  pointerType: 'touch',
  isPrimary: true,
  ...over,
})
const resize = () => act(() => resizeObservers.at(-1)?.trigger())

describe('useFloatingCard sizing and placing', () => {
  it('sizes the card to its content at its own size, and puts it in the lower right corner', () => {
    render(<Harness />)
    expect(wide()).toBe('200px')
    expect(high()).toBe('140px')
    expect(content().style.transform).toBe('scale(1)')
    expect(at()).toBe('translate3d(600px, 260px, 0)')
  })

  it('draws content that has more to say smaller, so the card stays whole and inside, and keeps its corner', () => {
    render(<Harness />)
    sizes.content = { width: 200, height: 400 }
    resize()
    // The box allows 65% of 400, less the 40 of bar: 220 of height for 400 of content.
    expect(content().style.transform).toBe('scale(0.55)')
    expect(wide()).toBe('110px')
    expect(high()).toBe('260px')
    expect(at()).toBe('translate3d(690px, 140px, 0)')
    // And back to its own size when it has less to say again.
    sizes.content = { width: 200, height: 100 }
    resize()
    expect(content().style.transform).toBe('scale(1)')
    expect(at()).toBe('translate3d(600px, 260px, 0)')
  })

  it('keeps a corner when the box grows', () => {
    render(<Harness />)
    sizes.box = { width: 1000, height: 400 }
    resize()
    expect(at()).toBe('translate3d(800px, 260px, 0)')
  })

  it('puts a card in a box with no room at the start of it', () => {
    sizes.box = { width: 0, height: 0 }
    render(<Harness />)
    expect(at()).toBe('translate3d(0px, 0px, 0)')
  })

  it('rounds to a device pixel', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true })
    placement.current = { x: 0.5, y: 0.5 }
    sizes.box = { width: 801, height: 400 }
    render(<Harness />)
    // Half of the 601px it has is 300.5: a whole device pixel at a ratio of two.
    expect(at()).toBe('translate3d(300.5px, 130px, 0)')
  })

  it('leaves a frozen card where it is, and does not listen to it', () => {
    const { rerender } = render(<Harness />)
    rerender(<Harness frozen />)
    fireEvent.pointerDown(grip(), touch(0, 0))
    fireEvent.pointerMove(grip(), touch(100, 100))
    expect(at()).toBe('translate3d(600px, 260px, 0)')
  })

  it('stops watching and listening when it goes', () => {
    const { unmount } = render(<Harness />)
    expect(resizeObservers).toHaveLength(1)
    unmount()
    expect(resizeObservers).toHaveLength(0)
  })
})

describe('useFloatingCard dragging', () => {
  beforeEach(() => {
    placement.current = { x: 0.5, y: 0.5 }
  })

  it('moves the card as far as the pointer, and no further past the edges', () => {
    render(<Harness />)
    expect(at()).toBe('translate3d(300px, 130px, 0)')
    fireEvent.pointerDown(grip(), touch(500, 400))
    expect(card().dataset.dragging).toBe('true')
    fireEvent.pointerMove(grip(), touch(530, 385))
    expect(at()).toBe('translate3d(330px, 115px, 0)')
    fireEvent.pointerMove(grip(), touch(3000, -3000))
    expect(at()).toBe('translate3d(600px, 0px, 0)')
    fireEvent.pointerMove(grip(), touch(530, 385))
    expect(at()).toBe('translate3d(330px, 115px, 0)')
  })

  it('reads a box turned a quarter turn from the screen\'s other axis', () => {
    render(<Harness turn={1} />)
    fireEvent.pointerDown(grip(), touch(500, 400))
    fireEvent.pointerMove(grip(), touch(490, 420))
    expect(at()).toBe('translate3d(320px, 140px, 0)')
  })

  it('renders nothing while it moves: not a component, not once', () => {
    let commits = 0
    render(
      <Profiler id="drag" onRender={() => (commits += 1)}>
        <Harness />
      </Profiler>,
    )
    const before = commits
    fireEvent.pointerDown(grip(), touch(500, 400))
    for (let i = 1; i <= 120; i++) fireEvent.pointerMove(grip(), touch(500 + i, 400 - i / 2))
    fireEvent.pointerUp(grip(), touch(620, 340))
    expect(commits).toBe(before)
  })

  it('keeps where it was left as a share of its room, once the pointer lifts', () => {
    render(<Harness />)
    fireEvent.pointerDown(grip(), touch(500, 400))
    fireEvent.pointerMove(grip(), touch(530, 385))
    expect(placement.current).toEqual({ x: 0.5, y: 0.5 })
    fireEvent.pointerUp(grip(), touch(530, 385))
    expect(placement.current).toEqual({ x: 330 / 600, y: 115 / 260 })
    expect(card().dataset.dragging).toBeUndefined()
    // And it stays there when the box changes size.
    sizes.box = { width: 1000, height: 400 }
    resize()
    expect(at()).toBe('translate3d(440px, 115px, 0)')
  })

  it('leaves a tap where it was, and keeps the share it had', () => {
    render(<Harness />)
    fireEvent.pointerDown(grip(), touch(500, 400))
    fireEvent.pointerUp(grip(), touch(500, 400))
    expect(placement.current).toEqual({ x: 0.5, y: 0.5 })
    expect(at()).toBe('translate3d(300px, 130px, 0)')
  })

  it('follows one pointer only, and only a primary one', () => {
    render(<Harness />)
    fireEvent.pointerDown(grip(), touch(500, 400, { isPrimary: false }))
    fireEvent.pointerMove(grip(), touch(530, 385))
    expect(at()).toBe('translate3d(300px, 130px, 0)')

    fireEvent.pointerDown(grip(), touch(500, 400))
    fireEvent.pointerDown(grip(), touch(0, 0, { pointerId: 2 }))
    fireEvent.pointerMove(grip(), touch(530, 385, { pointerId: 2 }))
    expect(at()).toBe('translate3d(300px, 130px, 0)')
    fireEvent.pointerMove(grip(), touch(530, 385))
    expect(at()).toBe('translate3d(330px, 115px, 0)')
  })

  it('takes a mouse only by its main button', () => {
    render(<Harness />)
    fireEvent.pointerDown(grip(), touch(500, 400, { pointerType: 'mouse', button: 2 }))
    fireEvent.pointerMove(grip(), touch(530, 385, { pointerType: 'mouse' }))
    expect(at()).toBe('translate3d(300px, 130px, 0)')
    fireEvent.pointerDown(grip(), touch(500, 400, { pointerType: 'mouse', button: 0 }))
    fireEvent.pointerMove(grip(), touch(530, 385, { pointerType: 'mouse' }))
    expect(at()).toBe('translate3d(330px, 115px, 0)')
  })

  it.each(['pointercancel', 'lostpointercapture'])('lets go on %s', (type) => {
    render(<Harness />)
    fireEvent.pointerDown(grip(), touch(500, 400))
    fireEvent.pointerMove(grip(), touch(530, 385))
    fireEvent(grip(), new Event(type))
    expect(card().dataset.dragging).toBeUndefined()
    fireEvent.pointerMove(grip(), touch(100, 100))
    expect(at()).toBe('translate3d(330px, 115px, 0)')
    expect(placement.current.x).toBeCloseTo(330 / 600)
  })

  it('ends a drag at a resize, which it measured for sizes that are gone, and puts the card by its share', () => {
    render(<Harness />)
    fireEvent.pointerDown(grip(), touch(500, 400))
    fireEvent.pointerMove(grip(), touch(530, 385))
    sizes.box = { width: 1000, height: 400 }
    resize()
    expect(at()).toBe('translate3d(440px, 115px, 0)')
    fireEvent.pointerMove(grip(), touch(100, 100))
    expect(at()).toBe('translate3d(440px, 115px, 0)')
  })

  it('does not throw where a pointer cannot be captured', () => {
    Object.defineProperty(Element.prototype, 'setPointerCapture', {
      value: () => {
        throw new Error('no such pointer')
      },
      configurable: true,
    })
    render(<Harness />)
    fireEvent.pointerDown(grip(), touch(500, 400))
    fireEvent.pointerMove(grip(), touch(530, 385))
    expect(at()).toBe('translate3d(330px, 115px, 0)')
  })
})

describe('useFloatingCard keys', () => {
  beforeEach(() => {
    placement.current = { x: 0.5, y: 0.5 }
  })

  it('moves a step for an arrow, four for an arrow with Shift, and not past an edge', () => {
    render(<Harness />)
    fireEvent.keyDown(grip(), { key: 'ArrowLeft' })
    expect(at()).toBe('translate3d(284px, 130px, 0)')
    fireEvent.keyDown(grip(), { key: 'ArrowDown', shiftKey: true })
    expect(at()).toBe('translate3d(284px, 194px, 0)')
    for (let i = 0; i < 6; i++) fireEvent.keyDown(grip(), { key: 'ArrowRight', shiftKey: true })
    expect(at()).toBe('translate3d(600px, 194px, 0)')
    for (let i = 0; i < 4; i++) fireEvent.keyDown(grip(), { key: 'ArrowUp', shiftKey: true })
    expect(at()).toBe('translate3d(600px, 0px, 0)')
  })

  it('keeps where a key left it, and ignores every other key', () => {
    render(<Harness />)
    fireEvent.keyDown(grip(), { key: 'ArrowLeft' })
    expect(placement.current).toEqual({ x: 284 / 600, y: 0.5 })
    expect(fireEvent.keyDown(grip(), { key: 'a' })).toBe(true)
    expect(at()).toBe('translate3d(284px, 130px, 0)')
  })

  it('stops the page scrolling for the arrow it takes', () => {
    render(<Harness />)
    expect(fireEvent.keyDown(grip(), { key: 'ArrowUp' })).toBe(false)
  })
})

describe('useFloatingCard resizing', () => {
  beforeEach(() => {
    placement.current = { x: 0.25, y: 0.25 }
  })

  it('grows the whole card with the corner, from its top left, and draws its content scaled', () => {
    render(<Harness />)
    expect(at()).toBe('translate3d(150px, 65px, 0)')
    fireEvent.pointerDown(corner(), touch(500, 300))
    // The diagonal is 200 x 100, so 40 along and 20 down is a fifth more.
    fireEvent.pointerMove(corner(), touch(540, 320))
    expect(content().style.transform).toBe('scale(1.2)')
    expect(wide()).toBe('240px')
    expect(high()).toBe('160px')
    expect(at()).toBe('translate3d(150px, 65px, 0)')
    expect(card().dataset.dragging).toBe('true')
  })

  it('keeps the size it was left at, and where the card then is, once the pointer lifts', () => {
    render(<Harness />)
    fireEvent.pointerDown(corner(), touch(500, 300))
    fireEvent.pointerMove(corner(), touch(540, 320))
    fireEvent.pointerUp(corner(), touch(540, 320))
    expect(choice.current).toBeCloseTo(1.2)
    expect(placement.current.x).toBeCloseTo(150 / (800 - 240))
    // And it is drawn at that size again when the box changes, rather than at its own.
    sizes.box = { width: 900, height: 400 }
    resize()
    expect(content().style.transform).toBe('scale(1.2)')
  })

  it('does not grow past most of the box, and pushes the card in rather than out', () => {
    placement.current = { x: 1, y: 1 }
    render(<Harness />)
    fireEvent.pointerDown(corner(), touch(500, 300))
    fireEvent.pointerMove(corner(), touch(-9000, -9000))
    expect(Number(content().style.transform.slice(6, -1))).toBeCloseTo(0.25)
    fireEvent.pointerMove(corner(), touch(9000, 9000))
    // 90% of 400 less the 40 of bar, over 100 of content: the height runs out first.
    expect(content().style.transform).toBe('scale(3.2)')
    expect(wide()).toBe('640px')
    expect(high()).toBe('360px')
    expect(at()).toBe('translate3d(160px, 40px, 0)')
  })

  it('reads a box turned a quarter turn from the screen\'s other axis', () => {
    render(<Harness turn={1} />)
    fireEvent.pointerDown(corner(), touch(500, 300))
    // 20 to the left of the screen is 20 down the box, and 40 down the screen is 40 along it.
    fireEvent.pointerMove(corner(), touch(480, 340))
    expect(content().style.transform).toBe('scale(1.2)')
  })

  it('draws content that has grown smaller than it was asked to be, rather than larger than the box', () => {
    render(<Harness />)
    fireEvent.pointerDown(corner(), touch(500, 300))
    fireEvent.pointerMove(corner(), touch(540, 320))
    fireEvent.pointerUp(corner(), touch(540, 320))
    sizes.content = { width: 200, height: 400 }
    resize()
    // 90% of 400 less the bar, over 400 of content.
    expect(content().style.transform).toBe('scale(0.8)')
  })

  it('ends at a resize of the box, which it measured for sizes that are gone', () => {
    render(<Harness />)
    fireEvent.pointerDown(corner(), touch(500, 300))
    fireEvent.pointerMove(corner(), touch(540, 320))
    sizes.box = { width: 900, height: 400 }
    resize()
    fireEvent.pointerMove(corner(), touch(700, 400))
    expect(content().style.transform).toBe('scale(1.2)')
  })

  it('renders nothing while it resizes', () => {
    let commits = 0
    render(
      <Profiler id="size" onRender={() => (commits += 1)}>
        <Harness />
      </Profiler>,
    )
    const before = commits
    fireEvent.pointerDown(corner(), touch(500, 300))
    for (let i = 1; i <= 100; i++) fireEvent.pointerMove(corner(), touch(500 + i, 300 + i / 2))
    fireEvent.pointerUp(corner(), touch(600, 350))
    expect(commits).toBe(before)
  })

  it('is made larger and smaller by the keys on the corner, a tenth at a time', () => {
    render(<Harness />)
    fireEvent.keyDown(corner(), { key: 'ArrowUp' })
    expect(content().style.transform).toBe('scale(1.1)')
    fireEvent.keyDown(corner(), { key: '+' })
    fireEvent.keyDown(corner(), { key: '-' })
    fireEvent.keyDown(corner(), { key: 'ArrowLeft' })
    expect(Number(content().style.transform.slice(6, -1))).toBeCloseTo(1)
    expect(fireEvent.keyDown(corner(), { key: 'a' })).toBe(true)
    expect(fireEvent.keyDown(corner(), { key: 'ArrowDown' })).toBe(false)
  })
})
