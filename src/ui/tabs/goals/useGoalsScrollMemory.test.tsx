import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { installFakeMatchMedia } from '../../../testing/fakeMatchMedia'
import { ADJUST_SECTIONS, adjustSectionId, openAdjustSections } from './adjustSections'
import { NARROW_MQ } from './useGoalsNarrow'
import { useGoalsScrollMemory } from './useGoalsScrollMemory'

let media: ReturnType<typeof installFakeMatchMedia>

beforeAll(() => {
  media = installFakeMatchMedia((query) => query === NARROW_MQ)
})

afterEach(() => {
  vi.restoreAllMocks()
  // A spy made again on window.scrollTo keeps the calls the last test made to it.
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  media.setMatching((query) => query === NARROW_MQ)
})

function setScrollY(y: number) {
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(y)
}

/** The frame the view was rendered in, which the page is put back on, runs at once. */
function runFramesNow() {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
}

describe('useGoalsScrollMemory', () => {
  it('puts a view back where it was left, and says so', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    runFramesNow()
    const { result } = renderHook(() => useGoalsScrollMemory())

    setScrollY(1360)
    result.current.leave('chart')

    expect(result.current.recall('chart')).toBe(true)
    expect(scrollTo).toHaveBeenCalledWith({ top: 1360, behavior: 'auto' })
  })

  it('has nothing to put back for a view that was never left', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    runFramesNow()
    const { result } = renderHook(() => useGoalsScrollMemory())

    expect(result.current.recall('progress')).toBe(false)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('is the same object after a render, so a callback that holds it need not change', () => {
    const { result, rerender } = renderHook(() => useGoalsScrollMemory())
    const first = result.current

    rerender()

    expect(result.current).toBe(first)
  })

  describe('for Adjust, whose sections fold up when its controls are unmounted', () => {
    function mountSections(open: string[]) {
      for (const s of ADJUST_SECTIONS) {
        const el = document.createElement('details')
        el.id = adjustSectionId(s.key)
        el.open = open.includes(s.key)
        document.body.append(el)
      }
    }

    afterEach(() => {
      document.body.innerHTML = ''
    })

    it('opens the sections that were showing before it scrolls, so the offset lands on the same page', () => {
      let openWhenScrolled: string[] = []
      vi.spyOn(window, 'scrollTo').mockImplementation(() => {
        openWhenScrolled = openAdjustSections()
      })
      runFramesNow()
      const { result } = renderHook(() => useGoalsScrollMemory())
      mountSections(['portfolio', 'events'])
      setScrollY(2125)
      result.current.leave('adjust')

      document.body.innerHTML = ''
      mountSections(['portfolio', 'housing', 'fire'])
      result.current.recall('adjust')

      expect(openWhenScrolled).toEqual(['portfolio', 'events'])
    })

    it('leaves the sections alone when another view is put back', () => {
      vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
      runFramesNow()
      const { result } = renderHook(() => useGoalsScrollMemory())
      mountSections(['portfolio', 'events'])
      result.current.leave('chart')

      document.body.innerHTML = ''
      mountSections(['fire'])
      result.current.recall('chart')

      expect(openAdjustSections()).toEqual(['fire'])
    })
  })

  it('forgets where views were left when the window crosses the breakpoint', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    runFramesNow()
    const { result } = renderHook(() => useGoalsScrollMemory())
    setScrollY(700)
    result.current.leave('chart')

    act(() => media.change(NARROW_MQ, false))
    act(() => media.change(NARROW_MQ, true))

    expect(result.current.recall('chart')).toBe(false)
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
