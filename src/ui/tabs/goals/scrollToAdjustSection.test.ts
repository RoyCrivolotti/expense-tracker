import { afterEach, describe, expect, it, vi } from 'vitest'
import { adjustSectionId } from './adjustSections'
import {
  ADJUST_STACK_ID,
  keepClearOfStack,
  landOnAdjustControls,
  pinnedBottom,
  scrollToAdjustSection,
} from './scrollToAdjustSection'
import { GOALS_NAV_ID } from './scrollToGoalsContent'

function mount(tag: 'div' | 'details', id: string, rect: Partial<DOMRect> = {}, height = 0) {
  const el = document.createElement(tag)
  el.id = id
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ top: 0, ...rect } as DOMRect)
  Object.defineProperty(el, 'offsetHeight', { configurable: true, value: height })
  document.body.append(el)
  return el
}

/** jsdom lays nothing out, so what the browser would resolve is written as inline style. */
function pin(el: HTMLElement, top?: string) {
  el.style.position = 'sticky'
  if (top !== undefined) el.style.top = top
}

/** The stack as the browser has it where it is pinned, and the row above it as it always is. */
function mountPinned(rows: { stackHeight?: number; stackTop?: string; rowHeight?: number; rowTop?: string }) {
  const row = mount('div', GOALS_NAV_ID, {}, rows.rowHeight ?? 0)
  pin(row, rows.rowTop)
  if (rows.stackHeight === undefined) return
  pin(mount('div', ADJUST_STACK_ID, {}, rows.stackHeight), rows.stackTop)
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('pinnedBottom', () => {
  it('is zero when nothing is pinned', () => {
    expect(pinnedBottom()).toBe(0)
  })

  it("is the stack's resolved sticky top plus its height when the stack is pinned", () => {
    mountPinned({ stackHeight: 164, stackTop: '103px', rowHeight: 44, rowTop: '60px' })

    expect(pinnedBottom()).toBe(267)
  })

  it('counts only the height when the browser does not resolve a top', () => {
    mountPinned({ stackHeight: 176 })

    expect(pinnedBottom()).toBe(176)
  })

  it('is the bottom of the view row when the stack is not pinned, as on a short screen', () => {
    mountPinned({ stackHeight: 164, rowHeight: 44, rowTop: '60px' })
    document.getElementById(ADJUST_STACK_ID)!.style.position = 'static'

    expect(pinnedBottom()).toBe(104)
  })

  it('is the bottom of the view row in a view that has no stack', () => {
    mountPinned({ rowHeight: 44, rowTop: '60px' })

    expect(pinnedBottom()).toBe(104)
  })
})

describe('scrollToAdjustSection', () => {
  it('scrolls by the distance from the pinned stack, opening a closed section first', () => {
    mountPinned({ stackHeight: 176 })
    const section = mount('details', adjustSectionId('events'), { top: 538 })
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})

    scrollToAdjustSection('events', 'smooth')

    expect((section as HTMLDetailsElement).open).toBe(true)
    expect(scrollBy).toHaveBeenCalledWith({ top: 538 - 176 - 8, behavior: 'smooth' })
  })

  it('scrolls to just under the view row when the stack is not pinned', () => {
    mountPinned({ stackHeight: 176, rowHeight: 44, rowTop: '60px' })
    document.getElementById(ADJUST_STACK_ID)!.style.position = 'static'
    mount('details', adjustSectionId('housing'), { top: 538 })
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})

    scrollToAdjustSection('housing', 'auto')

    expect(scrollBy).toHaveBeenCalledWith({ top: 538 - 104 - 8, behavior: 'auto' })
  })

  it('jumps without animation when the viewer asked for reduced motion', () => {
    mount('div', adjustSectionId('fire'), { top: 400 })
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    vi.stubGlobal('matchMedia', () => ({ matches: true }))

    scrollToAdjustSection('fire', 'smooth')

    expect(scrollBy).toHaveBeenCalledWith({ top: 400 - 8, behavior: 'auto' })
  })

  it('does nothing when the section is not on the page', () => {
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})

    scrollToAdjustSection('housing', 'auto')

    expect(scrollBy).not.toHaveBeenCalled()
  })
})

describe('landOnAdjustControls', () => {
  it('scrolls to the first section on the next frame, not before', () => {
    mount('details', adjustSectionId('portfolio'), { top: 700 })
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))

    landOnAdjustControls()
    expect(scrollBy).not.toHaveBeenCalled()

    frames.forEach((cb) => cb(0))
    expect(scrollBy).toHaveBeenCalledWith({ top: 700 - 8, behavior: 'auto' })
  })

  it('scrolls at once where requestAnimationFrame is absent', () => {
    mount('details', adjustSectionId('portfolio'), { top: 700 })
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    vi.stubGlobal('requestAnimationFrame', undefined)

    landOnAdjustControls()

    expect(scrollBy).toHaveBeenCalledTimes(1)
  })

  it('lands under the view row when the stack is not pinned', () => {
    mountPinned({ stackHeight: 164, rowHeight: 44, rowTop: '60px' })
    document.getElementById(ADJUST_STACK_ID)!.style.position = 'static'
    mount('details', adjustSectionId('portfolio'), { top: 700 })
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    vi.stubGlobal('requestAnimationFrame', undefined)

    landOnAdjustControls()

    expect(scrollBy).toHaveBeenCalledWith({ top: 700 - 104 - 8, behavior: 'auto' })
  })
})

describe('keepClearOfStack', () => {
  function fieldAt(top: number) {
    return mount('div', 'a-field', { top })
  }

  function stackAt(top: number, bottom: number) {
    pin(mount('div', ADJUST_STACK_ID, { top, bottom }))
  }

  it('scrolls a field that is behind the stack to just below it, again once the keyboard has settled', () => {
    vi.useFakeTimers()
    stackAt(103, 267)
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })

    keepClearOfStack(fieldAt(150))
    expect(scrollBy).toHaveBeenCalledTimes(1)
    expect(scrollBy).toHaveBeenLastCalledWith({ top: 150 - 267 - 8, behavior: 'auto' })

    vi.advanceTimersByTime(400)
    expect(scrollBy).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('leaves a field that is below the stack, or above it, where it is', () => {
    vi.useFakeTimers()
    stackAt(103, 267)
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    vi.stubGlobal('requestAnimationFrame', undefined)

    keepClearOfStack(fieldAt(400))
    vi.advanceTimersByTime(400)
    document.getElementById('a-field')?.remove()
    keepClearOfStack(fieldAt(60))
    vi.advanceTimersByTime(400)

    expect(scrollBy).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('measures against the view row when the stack is not pinned', () => {
    vi.useFakeTimers()
    mount('div', GOALS_NAV_ID, { top: 60, bottom: 104 })
    stackAt(-400, -236)
    document.getElementById(ADJUST_STACK_ID)!.style.position = 'static'
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    vi.stubGlobal('requestAnimationFrame', undefined)

    keepClearOfStack(fieldAt(90))

    expect(scrollBy).toHaveBeenCalledWith({ top: 90 - 104 - 8, behavior: 'auto' })
    vi.useRealTimers()
  })

  it('does nothing when there is no stack on the page', () => {
    vi.useFakeTimers()
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    vi.stubGlobal('requestAnimationFrame', undefined)

    keepClearOfStack(fieldAt(150))

    expect(scrollBy).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
