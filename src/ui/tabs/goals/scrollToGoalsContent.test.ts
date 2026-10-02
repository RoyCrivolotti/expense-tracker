import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GOALS_CONTENT_ANCHOR_ID,
  restoreScrollPosition,
  scrollToGoalsContent,
} from './scrollToGoalsContent'

function mountAnchor() {
  const anchor = document.createElement('div')
  anchor.id = GOALS_CONTENT_ANCHOR_ID
  const scrollIntoView = vi.fn()
  anchor.scrollIntoView = scrollIntoView
  document.body.append(anchor)
  return scrollIntoView
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

describe('scrollToGoalsContent', () => {
  it('scrolls the content anchor to the top on the next frame, in the way it was asked', () => {
    const scrollIntoView = mountAnchor()
    runFramesNow()

    scrollToGoalsContent('smooth')
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'smooth', block: 'start' })

    scrollToGoalsContent('auto')
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'auto', block: 'start' })
  })

  it('does not wait for the frame before it has been asked for one', () => {
    const scrollIntoView = mountAnchor()
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))

    scrollToGoalsContent('auto')
    expect(scrollIntoView).not.toHaveBeenCalled()

    frames.forEach((cb) => cb(0))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('jumps without animation when the viewer asked for reduced motion', () => {
    const scrollIntoView = mountAnchor()
    runFramesNow()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))

    scrollToGoalsContent('smooth')

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
  })

  it('does not throw where the anchor cannot scroll itself into view', () => {
    const anchor = document.createElement('div')
    anchor.id = GOALS_CONTENT_ANCHOR_ID
    document.body.append(anchor)
    runFramesNow()

    expect(() => scrollToGoalsContent('auto')).not.toThrow()
  })

  it('does not throw when the anchor is not mounted', () => {
    runFramesNow()

    expect(() => scrollToGoalsContent('auto')).not.toThrow()
  })

  it('scrolls at once where requestAnimationFrame is absent', () => {
    const scrollIntoView = mountAnchor()
    vi.stubGlobal('requestAnimationFrame', undefined)

    scrollToGoalsContent('auto')

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  describe('when asked to scroll only if the content is past', () => {
    function anchorAt(top: number, scrollMarginTop: string) {
      const anchor = document.createElement('div')
      anchor.id = GOALS_CONTENT_ANCHOR_ID
      const scrollIntoView = vi.fn()
      anchor.scrollIntoView = scrollIntoView
      vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({ top } as DOMRect)
      vi.spyOn(window, 'getComputedStyle').mockReturnValue({ scrollMarginTop } as CSSStyleDeclaration)
      document.body.append(anchor)
      return scrollIntoView
    }

    it('scrolls when the content already starts above where it would be put', () => {
      const scrollIntoView = anchorAt(-400, '104px')
      runFramesNow()

      scrollToGoalsContent('auto', { ifPast: true })

      expect(scrollIntoView).toHaveBeenCalledTimes(1)
    })

    it('leaves the page alone when the content starts at or below that place', () => {
      const scrollIntoView = anchorAt(300, '104px')
      runFramesNow()

      scrollToGoalsContent('auto', { ifPast: true })

      expect(scrollIntoView).not.toHaveBeenCalled()
    })
  })
})

describe('restoreScrollPosition', () => {
  it('scrolls to the saved position on the next frame, not before', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))

    restoreScrollPosition(1400)
    expect(scrollTo).not.toHaveBeenCalled()

    frames.forEach((cb) => cb(0))
    expect(scrollTo).toHaveBeenCalledWith({ top: 1400, behavior: 'auto' })
  })
})
