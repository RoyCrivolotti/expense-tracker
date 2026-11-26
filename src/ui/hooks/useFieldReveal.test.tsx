import { act, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeMatchMedia } from '../../testing/fakeMatchMedia'
import {
  PHONE_LAYOUT,
  REVEAL_EDGE_GAP_PX,
  REVEAL_GAP_PX,
  REVEAL_GLIDE_MS,
  REVEAL_PEEK_PX,
  revealTop,
  useFieldReveal,
} from './useFieldReveal'
import { setMotionDisabledForTests } from './motion'

/** Where the sheet's top edge is drawn on screen. */
const SHEET_TOP = 100

/**
 * jsdom lays nothing out, so every element is placed by hand: `data-y` is where it sits in the sheet's content and
 * `data-h` its height, and its rect moves up as the sheet scrolls, the way a browser's would.
 */
function placeElements(scroller: () => HTMLElement | null) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const sheet = scroller()
    if (this === sheet) return DOMRect.fromRect({ x: 0, y: SHEET_TOP, width: 375, height: 300 })
    const y = Number((this as HTMLElement).dataset.y ?? 0)
    const h = Number((this as HTMLElement).dataset.h ?? 40)
    const pinned = (this as HTMLElement).dataset.pinned
    const top = pinned !== undefined ? SHEET_TOP + Number(pinned) : SHEET_TOP + y - (sheet?.scrollTop ?? 0)
    return DOMRect.fromRect({ x: 0, y: top, width: 375, height: h })
  })
  // jsdom gives every element an empty rect list, which reads as "not rendered".
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    return (this.closest('[hidden]') ? [] : [this.getBoundingClientRect()]) as unknown as DOMRectList
  })
}

function Sheet({ enabled = true, cover = false }: { enabled?: boolean; cover?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useFieldReveal(ref, enabled)
  return (
    <div ref={ref} data-testid="sheet">
      {cover ? (
        <section data-reveal-cover data-y="0" data-h="40" data-pinned="0" style={{ position: 'sticky' }}>
          From your bank
        </section>
      ) : null}
      <label data-y="200" data-h="70">
        Amount
        <input aria-label="Amount" data-y="224" data-h="46" />
      </label>
      <label data-y="290" data-h="70">
        Description
        <input aria-label="Description" data-y="314" data-h="46" />
      </label>
      <label data-y="380" data-h="70">
        Category
        <select aria-label="Category" data-y="404" data-h="46">
          <option>Groceries</option>
        </select>
      </label>
      <input hidden aria-label="Hidden" data-y="0" />
      <label data-y="470" data-h="70">
        Notes
        <textarea aria-label="Notes" data-y="494" data-h="46" />
      </label>
    </div>
  )
}

/** Marks `<html>` the way useKeyboardOpen does; the hook hears it through a MutationObserver, a microtask later. */
async function keyboard(open: boolean) {
  await act(async () => {
    document.documentElement.toggleAttribute('data-keyboard-open', open)
    await Promise.resolve()
  })
}

function focus(el: HTMLElement) {
  act(() => el.focus())
  act(() => void vi.advanceTimersByTime(0))
}

let sheet: HTMLElement | null = null

beforeEach(() => {
  vi.useFakeTimers()
  placeElements(() => sheet)
})

afterEach(() => {
  document.documentElement.removeAttribute('data-keyboard-open')
  setMotionDisabledForTests(true)
  vi.useRealTimers()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'matchMedia')
  sheet = null
})

function open(props: { enabled?: boolean; cover?: boolean } = {}) {
  const view = render(<Sheet {...props} />)
  sheet = view.getByTestId('sheet')
  return view
}

describe('useFieldReveal', () => {
  it('moves the field to the top when the keyboard arrives, its caption clear of the status bar’s blur', async () => {
    const { getByLabelText } = open()
    focus(getByLabelText('Amount'))
    expect(sheet!.scrollTop).toBe(0)

    await keyboard(true)
    // Amount is the first field: nothing above it has to stay in sight.
    expect(sheet!.scrollTop).toBe(200 - REVEAL_EDGE_GAP_PX)
  })

  it('leaves the middle of the field above in sight, or the keyboard’s up arrow could not reach it', async () => {
    const { getByLabelText } = open()
    await keyboard(true)
    focus(getByLabelText('Description'))
    // Its own caption would put it at 278; Amount's middle (224 + 23) has to stay REVEAL_PEEK_PX inside the edge.
    expect(sheet!.scrollTop).toBe(224 + 23 - REVEAL_PEEK_PX)
    expect(sheet!.scrollTop).toBeLessThan(290 - REVEAL_EDGE_GAP_PX)
  })

  it('skips a select when finding the field above, as the keyboard’s arrows do', async () => {
    const { getByLabelText } = open()
    await keyboard(true)
    focus(getByLabelText('Notes'))
    // The field above Notes for the arrows is Description, not Category.
    expect(sheet!.scrollTop).toBe(314 + 23 - REVEAL_PEEK_PX)
  })

  it('moves again each time focus moves to another field while the keyboard stays up', async () => {
    const { getByLabelText } = open()
    await keyboard(true)
    focus(getByLabelText('Description'))
    const first = sheet!.scrollTop
    focus(getByLabelText('Amount'))
    expect(sheet!.scrollTop).toBe(200 - REVEAL_EDGE_GAP_PX)
    expect(sheet!.scrollTop).not.toBe(first)
  })

  it('starts the fields below a line that sticks to the top while the keyboard is up', async () => {
    const { getByLabelText } = open({ cover: true })
    await keyboard(true)
    focus(getByLabelText('Amount'))
    // The line covers the sheet's first 40px, so the caption lands a small gap below it.
    expect(sheet!.scrollTop).toBe(200 - 40 - REVEAL_GAP_PX)
  })

  it('moves nothing without the keyboard: a hardware keyboard, a desktop, or a field focused by Tab', () => {
    const { getByLabelText } = open()
    focus(getByLabelText('Description'))
    expect(sheet!.scrollTop).toBe(0)
  })

  it('moves the field on a phone-sized screen, and nothing where the sheet is a dialog, as with an iPad keyboard', async () => {
    const media = installFakeMatchMedia((query) => query === PHONE_LAYOUT)
    const { getByLabelText } = open()
    await keyboard(true)
    focus(getByLabelText('Amount'))
    expect(sheet!.scrollTop).toBe(200 - REVEAL_EDGE_GAP_PX)

    sheet!.scrollTop = 0
    media.setMatching(() => false)
    focus(getByLabelText('Description'))
    expect(sheet!.scrollTop).toBe(0)
  })

  it('moves nothing for a control that opens no keyboard', async () => {
    const { getByLabelText } = open()
    await keyboard(true)
    focus(getByLabelText('Category'))
    expect(sheet!.scrollTop).toBe(0)
  })

  it('does nothing while switched off, as a leaving sheet is', async () => {
    const { getByLabelText } = open({ enabled: false })
    await keyboard(true)
    focus(getByLabelText('Description'))
    expect(sheet!.scrollTop).toBe(0)
  })

  it('glides with motion on, follows the field while it moves, and lands exactly', async () => {
    setMotionDisabledForTests(false)
    let now = 0
    const frames: FrameRequestCallback[] = []
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => frames.push(fn))
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => frames.splice(0))
    const tick = (ms: number) => {
      now += ms
      frames.splice(0).forEach((fn) => fn(now))
    }

    const { getByLabelText } = open()
    focus(getByLabelText('Amount'))
    await keyboard(true)
    tick(16)
    const partway = sheet!.scrollTop
    expect(partway).toBeGreaterThan(0)
    expect(partway).toBeLessThan(200 - REVEAL_EDGE_GAP_PX)

    // Something above folds away mid-glide: the field moves up 60px and the glide follows it there.
    getByLabelText('Amount').closest('label')!.dataset.y = '140'
    tick(REVEAL_GLIDE_MS)
    expect(sheet!.scrollTop).toBe(140 - REVEAL_EDGE_GAP_PX)
    expect(frames).toHaveLength(0)
  })

  it('stops gliding when a finger lands on the sheet or the keyboard goes', async () => {
    setMotionDisabledForTests(false)
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => frames.push(fn))
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => void frames.splice(0))

    const { getByLabelText } = open()
    focus(getByLabelText('Amount'))
    await keyboard(true)
    expect(frames).toHaveLength(1)
    act(() => void sheet!.dispatchEvent(new Event('touchstart')))
    expect(frames).toHaveLength(0)

    await keyboard(false)
    await keyboard(true)
    expect(frames).toHaveLength(1)
    await keyboard(false)
    expect(frames).toHaveLength(0)
  })

  it('stops listening once unmounted', async () => {
    const { getByLabelText, unmount } = open()
    const field = getByLabelText('Amount')
    focus(field)
    const scroller = sheet!
    unmount()
    document.body.appendChild(scroller)
    await keyboard(true)
    expect(scroller.scrollTop).toBe(0)
    scroller.remove()
  })
})

describe('revealTop', () => {
  it('is never above the start of the sheet', () => {
    const scroller = document.createElement('div')
    const field = document.createElement('input')
    field.dataset.y = '4'
    scroller.appendChild(field)
    document.body.appendChild(scroller)
    sheet = scroller
    expect(revealTop(field, scroller)).toBe(0)
    scroller.remove()
  })

  it('keeps no field above in sight for one the keyboard’s arrows do not stop at', () => {
    const scroller = document.createElement('div')
    const above = document.createElement('input')
    above.dataset.y = '100'
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    editable.dataset.y = '300'
    scroller.append(above, editable)
    document.body.appendChild(scroller)
    sheet = scroller
    expect(revealTop(editable, scroller)).toBe(300 - REVEAL_EDGE_GAP_PX)
    scroller.remove()
  })
})
