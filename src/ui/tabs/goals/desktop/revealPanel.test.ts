import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { revealPanel } from './revealPanel'

const VIEWPORT = 900

function mountPanel(top: number) {
  const panel = document.createElement('div')
  panel.id = 'panel'
  panel.getBoundingClientRect = () => ({ top }) as DOMRect
  const scrollIntoView = vi.fn()
  panel.scrollIntoView = scrollIntoView
  document.body.append(panel)
  return scrollIntoView
}

beforeEach(() => {
  vi.stubGlobal('innerHeight', VIEWPORT)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
})

afterEach(() => {
  document.body.innerHTML = ''
  document.documentElement.style.scrollPaddingTop = ''
  vi.unstubAllGlobals()
})

describe('revealPanel', () => {
  it('scrolls a panel that opened below the fold up to the top of the page', () => {
    const scrollIntoView = mountPanel(1013)

    revealPanel('panel')

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('scrolls a panel that opened in the lower half of the screen, where most of it would be cut off', () => {
    const scrollIntoView = mountPanel(VIEWPORT / 2 + 1)

    revealPanel('panel')

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('leaves the page alone when the panel opened in the upper half', () => {
    const scrollIntoView = mountPanel(300)

    revealPanel('panel')

    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('scrolls a panel that opened up under the header and the stuck bar', () => {
    document.documentElement.style.scrollPaddingTop = '200px'
    const scrollIntoView = mountPanel(150)

    revealPanel('panel')

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('leaves a panel just under the stuck bar where it is', () => {
    document.documentElement.style.scrollPaddingTop = '200px'
    const scrollIntoView = mountPanel(210)

    revealPanel('panel')

    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('jumps without animation when the viewer asked for reduced motion', () => {
    const scrollIntoView = mountPanel(1013)
    vi.stubGlobal('matchMedia', () => ({ matches: true }))

    revealPanel('panel')

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
  })

  it('waits for the frame, so the panel is measured once it has rendered', () => {
    const scrollIntoView = mountPanel(1013)
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))

    revealPanel('panel')
    expect(scrollIntoView).not.toHaveBeenCalled()

    frames.forEach((cb) => cb(0))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('does not throw when the panel is gone, or cannot scroll itself into view', () => {
    expect(() => revealPanel('panel')).not.toThrow()

    const panel = document.createElement('div')
    panel.id = 'panel'
    panel.getBoundingClientRect = () => ({ top: 1013 }) as DOMRect
    document.body.append(panel)
    expect(() => revealPanel('panel')).not.toThrow()
  })
})
