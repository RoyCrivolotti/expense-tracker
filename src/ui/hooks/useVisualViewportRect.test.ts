import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
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

afterEach(() => {
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
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

  it('follows a scroll of the visual viewport too', () => {
    const { vv, fire } = stubViewport(0, 800)
    const { result } = renderHook(() => useVisualViewportRect())

    vv.offsetTop = 60
    fire('scroll')

    expect(result.current).toEqual({ top: 60, height: 800 })
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
