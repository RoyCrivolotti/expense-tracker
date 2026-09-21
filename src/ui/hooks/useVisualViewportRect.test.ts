import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useVisualViewportRect } from './useVisualViewportRect'

type Listener = () => void

function stubViewport(top: number, height: number) {
  const listeners: { resize: Listener[]; scroll: Listener[] } = { resize: [], scroll: [] }
  const vv = {
    offsetTop: top,
    height,
    addEventListener: (type: 'resize' | 'scroll', fn: Listener) => listeners[type].push(fn),
    removeEventListener: (type: 'resize' | 'scroll', fn: Listener) => {
      listeners[type] = listeners[type].filter((l) => l !== fn)
    },
  }
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv })
  return {
    vv,
    fire: (type: 'resize' | 'scroll') => act(() => listeners[type].forEach((l) => l())),
    listenerCount: () => listeners.resize.length + listeners.scroll.length,
  }
}

const JSDOM_INNER_HEIGHT = window.innerHeight

function setInnerHeight(value: number) {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value })
}

beforeEach(() => setInnerHeight(JSDOM_INNER_HEIGHT))

afterEach(() => {
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
  setInnerHeight(JSDOM_INNER_HEIGHT)
})

describe('useVisualViewportRect', () => {
  it('reports the visible slice on the first render, not after a second commit', () => {
    stubViewport(0, 800)
    const { result } = renderHook(() => useVisualViewportRect())
    expect(result.current).toEqual({ top: 0, height: 800 })
  })

  it('follows the pan when a keyboard opens', () => {
    // iOS does not resize the layout viewport for a keyboard; it pans a smaller
    // visual one inside it. Fixed content has to follow, or it slides out of
    // view in the opposite direction.
    const { vv, fire } = stubViewport(0, 800)
    const { result } = renderHook(() => useVisualViewportRect())

    vv.offsetTop = 120
    vv.height = 400
    fire('resize')

    expect(result.current).toEqual({ top: 120, height: 400 })
  })

  it('follows the scroll that lands after the keyboard has resized the viewport', () => {
    // The keyboard arrives as a resize and then a scroll, so by the time the pan
    // is reported the viewport is already smaller than the layout one.
    const { vv, fire } = stubViewport(0, 400)
    const { result } = renderHook(() => useVisualViewportRect())

    vv.offsetTop = 60
    fire('scroll')

    expect(result.current).toEqual({ top: 60, height: 400 })
  })

  it('ignores a pan while the viewport is as tall as the layout one', () => {
    // A pinned body leaves slack under the layout viewport, and a finger drag pans
    // the page inside it. Nothing fixed moves on screen, so following the number
    // slid the sheet against the finger.
    setInnerHeight(812)
    const { vv, fire } = stubViewport(0, 812)
    const { result } = renderHook(() => useVisualViewportRect())

    vv.offsetTop = 70
    fire('scroll')

    expect(result.current).toEqual({ top: 0, height: 812 })
  })

  it('lets go of the pan as soon as the keyboard is gone', () => {
    setInnerHeight(812)
    const { vv, fire } = stubViewport(131, 504)
    const { result } = renderHook(() => useVisualViewportRect())
    expect(result.current).toEqual({ top: 131, height: 504 })

    // The height comes back before the offset settles, so a stale offset must not stick.
    vv.height = 812
    fire('resize')

    expect(result.current).toEqual({ top: 0, height: 812 })
  })

  it('treats a shortfall under a pixel as rounding, not a shrink', () => {
    setInnerHeight(812)
    const { vv, fire } = stubViewport(0, 812)
    const { result } = renderHook(() => useVisualViewportRect())

    vv.height = 811.5
    vv.offsetTop = 30
    fire('scroll')

    expect(result.current).toEqual({ top: 0, height: 811.5 })
  })

  it('follows a viewport that is a pixel or more shorter than the layout one', () => {
    setInnerHeight(812)
    const { vv, fire } = stubViewport(0, 812)
    const { result } = renderHook(() => useVisualViewportRect())

    vv.height = 810
    vv.offsetTop = 30
    fire('scroll')

    expect(result.current).toEqual({ top: 30, height: 810 })
  })

  it('is null without the API, so the caller keeps its CSS fallback', () => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
    const { result } = renderHook(() => useVisualViewportRect())
    expect(result.current).toBeNull()
  })

  it('unsubscribes on unmount', () => {
    const { listenerCount } = stubViewport(0, 800)
    const { unmount } = renderHook(() => useVisualViewportRect())
    expect(listenerCount()).toBe(2)
    unmount()
    expect(listenerCount()).toBe(0)
  })
})
