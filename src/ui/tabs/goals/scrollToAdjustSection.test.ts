import { afterEach, describe, expect, it, vi } from 'vitest'
import { adjustSectionId } from './adjustSections'
import {
  ADJUST_STACK_ID,
  landOnAdjustControls,
  scrollToAdjustSection,
  stackBottom,
} from './scrollToAdjustSection'

function mount(tag: 'div' | 'details', id: string, rect: Partial<DOMRect> = {}, height = 0) {
  const el = document.createElement(tag)
  el.id = id
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ top: 0, ...rect } as DOMRect)
  Object.defineProperty(el, 'offsetHeight', { configurable: true, value: height })
  document.body.append(el)
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('stackBottom', () => {
  it('is zero when there is no pinned stack', () => {
    expect(stackBottom()).toBe(0)
  })

  it('is the stack\'s resolved sticky top plus its height', () => {
    const stack = mount('div', ADJUST_STACK_ID, {}, 176)
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ top: '103px' } as CSSStyleDeclaration)

    expect(stackBottom()).toBe(279)
    expect(stack).toBeInTheDocument()
  })

  it('counts only the height when the browser does not resolve a top', () => {
    mount('div', ADJUST_STACK_ID, {}, 176)

    expect(stackBottom()).toBe(176)
  })
})

describe('scrollToAdjustSection', () => {
  it('scrolls by the distance from the pinned stack, opening a closed section first', () => {
    mount('div', ADJUST_STACK_ID, {}, 176)
    const section = mount('details', adjustSectionId('events'), { top: 538 })
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})

    scrollToAdjustSection('events', 'smooth')

    expect((section as HTMLDetailsElement).open).toBe(true)
    expect(scrollBy).toHaveBeenCalledWith({ top: 538 - 176 - 8, behavior: 'smooth' })
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
})
