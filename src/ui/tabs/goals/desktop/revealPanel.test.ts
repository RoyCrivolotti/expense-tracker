import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { revealPanel } from './revealPanel'

const VIEWPORT = 900

function mountPanel(top: number) {
  const panel = document.createElement('div')
  panel.id = 'panel'
  panel.getBoundingClientRect = () => ({ top }) as DOMRect
  document.body.append(panel)
}

/** The bar, stuck under the header: its top as the stylesheet resolves it, and a height jsdom cannot measure. */
function mountStuckBar({ top = 64, height = 111 } = {}) {
  const bar = document.createElement('div')
  bar.setAttribute('data-levers-bar', '')
  bar.style.position = 'sticky'
  bar.style.top = `${top}px`
  Object.defineProperty(bar, 'offsetHeight', { value: height })
  document.body.append(bar)
}

let scrollBy: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.stubGlobal('innerHeight', VIEWPORT)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
  scrollBy = vi.fn()
  window.scrollBy = scrollBy as unknown as typeof window.scrollBy
})

afterEach(() => {
  document.body.innerHTML = ''
  document.documentElement.style.scrollPaddingTop = ''
  vi.unstubAllGlobals()
})

describe('revealPanel', () => {
  it('scrolls a panel that opened below the fold up to the top of the page', () => {
    document.documentElement.style.scrollPaddingTop = '72px'
    mountPanel(1013)

    revealPanel('panel')

    // It is 1013 down and the page's visible area starts 72 down.
    expect(scrollBy).toHaveBeenCalledWith({ top: 941, behavior: 'smooth' })
  })

  it('scrolls a panel that opened in the lower half of the screen, where most of it would be cut off', () => {
    mountPanel(VIEWPORT / 2 + 1)

    revealPanel('panel')

    expect(scrollBy).toHaveBeenCalledTimes(1)
  })

  it('leaves the page alone when the panel opened in the upper half', () => {
    mountPanel(300)

    revealPanel('panel')

    expect(scrollBy).not.toHaveBeenCalled()
  })

  it('scrolls a panel that opened up under the header and the stuck bar', () => {
    document.documentElement.style.scrollPaddingTop = '200px'
    mountPanel(150)

    revealPanel('panel')

    expect(scrollBy).toHaveBeenCalledWith({ top: -50, behavior: 'smooth' })
  })

  it('leaves a panel just under the stuck bar where it is', () => {
    document.documentElement.style.scrollPaddingTop = '200px'
    mountPanel(210)

    revealPanel('panel')

    expect(scrollBy).not.toHaveBeenCalled()
  })

  it('keeps the panel clear of the stuck bar when the page padding has been lifted for focus in the bar', () => {
    // The All inputs button is in the bar, so while it has focus the page's padding is only the header's.
    document.documentElement.style.scrollPaddingTop = '72px'
    mountStuckBar({ top: 64, height: 111 })
    mountPanel(64)

    revealPanel('panel')

    // The bar ends 175 down, and the air under it is 8: the panel belongs 183 down, where it is not.
    expect(scrollBy).toHaveBeenCalledWith({ top: 64 - 183, behavior: 'smooth' })
  })

  it('does not count a bar that is not stuck, which goes by with the page', () => {
    document.documentElement.style.scrollPaddingTop = '72px'
    const bar = document.createElement('div')
    bar.setAttribute('data-levers-bar', '')
    Object.defineProperty(bar, 'offsetHeight', { value: 186 })
    document.body.append(bar)
    mountPanel(100)

    revealPanel('panel')

    expect(scrollBy).not.toHaveBeenCalled()
  })

  it('jumps without animation when the viewer asked for reduced motion', () => {
    mountPanel(1013)
    vi.stubGlobal('matchMedia', () => ({ matches: true }))

    revealPanel('panel')

    expect(scrollBy).toHaveBeenCalledWith({ top: 1013, behavior: 'auto' })
  })

  it('waits for the frame, so the panel is measured once it has rendered', () => {
    mountPanel(1013)
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))

    revealPanel('panel')
    expect(scrollBy).not.toHaveBeenCalled()

    frames.forEach((cb) => cb(0))
    expect(scrollBy).toHaveBeenCalledTimes(1)
  })

  it('does not throw when the panel is gone, or the environment cannot scroll', () => {
    expect(() => revealPanel('panel')).not.toThrow()

    mountPanel(1013)
    window.scrollBy = undefined as unknown as typeof window.scrollBy
    expect(() => revealPanel('panel')).not.toThrow()
  })
})
