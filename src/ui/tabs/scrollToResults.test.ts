import { afterEach, describe, expect, it, vi } from 'vitest'
import { RESULTS_ANCHOR_ID, scrollToResults } from './scrollToResults'

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('scrollToResults', () => {
  it('scrolls the results anchor into view on the next frame', () => {
    const anchor = document.createElement('div')
    anchor.id = RESULTS_ANCHOR_ID
    const scrollIntoView = vi.fn()
    anchor.scrollIntoView = scrollIntoView
    document.body.append(anchor)
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })

    scrollToResults()

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('does not throw when the anchor is not mounted', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })

    expect(() => scrollToResults()).not.toThrow()
  })

  it('falls back to scrolling synchronously where requestAnimationFrame is absent', () => {
    const anchor = document.createElement('div')
    anchor.id = RESULTS_ANCHOR_ID
    const scrollIntoView = vi.fn()
    anchor.scrollIntoView = scrollIntoView
    document.body.append(anchor)
    vi.stubGlobal('requestAnimationFrame', undefined)

    scrollToResults()

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })
})
