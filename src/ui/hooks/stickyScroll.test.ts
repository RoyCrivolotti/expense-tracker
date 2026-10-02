import { afterEach, describe, expect, it, vi } from 'vitest'
import { isStuck, restoreScroll, scrollToAnchor, stickyBottom } from './stickyScroll'

/** jsdom lays nothing out: a sticky block at `top`, `height` tall, and `y` px down the screen now. */
function sticky(top: string, height: number, y = 0) {
  const el = document.createElement('div')
  el.style.position = 'sticky'
  el.style.top = top
  Object.defineProperty(el, 'offsetHeight', { configurable: true, value: height })
  el.getBoundingClientRect = () => ({ top: y }) as DOMRect
  document.body.append(el)
  return el
}

function runFramesNow() {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('stickyBottom', () => {
  it('is where the element sticks plus how tall it is', () => {
    expect(stickyBottom(sticky('60px', 44))).toBe(104)
  })

  it('counts a sticky top that cannot be read as the top of the page', () => {
    expect(stickyBottom(sticky('auto', 44))).toBe(44)
  })
})

describe('isStuck', () => {
  it('is false for nothing', () => {
    expect(isStuck(null)).toBe(false)
  })

  it('is false while the element is still lower than where it sticks', () => {
    expect(isStuck(sticky('60px', 44, 150))).toBe(false)
  })

  it('is true once it has been carried down to where it sticks', () => {
    expect(isStuck(sticky('60px', 44, 60))).toBe(true)
  })

  it('allows half a pixel of slack, and no more', () => {
    expect(isStuck(sticky('60px', 44, 60.5))).toBe(true)
    expect(isStuck(sticky('60px', 44, 60.6))).toBe(false)
  })
})

describe('scrollToAnchor', () => {
  function mountAnchor(id: string) {
    const anchor = document.createElement('div')
    anchor.id = id
    const scrollIntoView = vi.fn()
    anchor.scrollIntoView = scrollIntoView
    document.body.append(anchor)
    return scrollIntoView
  }

  it('scrolls the anchor with that id to the top on the next frame, as it was asked', () => {
    const scrollIntoView = mountAnchor('here')
    const other = mountAnchor('there')
    runFramesNow()

    scrollToAnchor('here', 'smooth')

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(other).not.toHaveBeenCalled()
  })

  it('does not scroll before the frame', () => {
    const scrollIntoView = mountAnchor('here')
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))

    scrollToAnchor('here', 'auto')
    expect(scrollIntoView).not.toHaveBeenCalled()

    frames.forEach((cb) => cb(0))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('jumps without animation when the viewer asked for reduced motion', () => {
    const scrollIntoView = mountAnchor('here')
    runFramesNow()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))

    scrollToAnchor('here', 'smooth')

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
  })

  it('does not throw when the anchor is missing or cannot scroll itself into view', () => {
    runFramesNow()
    expect(() => scrollToAnchor('missing', 'auto')).not.toThrow()

    const bare = document.createElement('div')
    bare.id = 'bare'
    document.body.append(bare)
    expect(() => scrollToAnchor('bare', 'auto')).not.toThrow()
  })
})

describe('restoreScroll', () => {
  it('scrolls to the position on the next frame, not before', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))

    restoreScroll(900)
    expect(scrollTo).not.toHaveBeenCalled()

    frames.forEach((cb) => cb(0))
    expect(scrollTo).toHaveBeenCalledWith({ top: 900, behavior: 'auto' })
  })

  it('does what it is asked to before it scrolls', () => {
    const order: string[] = []
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      order.push('scroll')
    })
    runFramesNow()

    restoreScroll(900, () => order.push('prepare'))

    expect(order).toEqual(['prepare', 'scroll'])
  })
})
