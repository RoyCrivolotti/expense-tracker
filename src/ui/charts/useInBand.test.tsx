import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installFakeIntersectionObserver } from '../../testing/fakeIntersectionObserver'
import { useInBand } from './useInBand'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const element = () => ({ current: document.createElement('div') })

describe('useInBand', () => {
  it('follows what the observer reports, against the share asked for', () => {
    const io = installFakeIntersectionObserver()
    const { result } = renderHook(() => useInBand(element(), 1))
    expect(result.current).toBe(false)
    act(() => io.emit(1))
    expect(result.current).toBe(true)
    // Mostly in, but the share asked for is all of it.
    act(() => io.emit(0.8))
    expect(result.current).toBe(false)
    const partly = renderHook(() => useInBand(element(), 0.4))
    act(() => io.emit(0.5, 1))
    expect(partly.result.current).toBe(true)
    act(() => io.emit(0.2, 1))
    expect(partly.result.current).toBe(false)
  })

  it('looks at the free band: the viewport less the header and the tab bar', () => {
    const io = installFakeIntersectionObserver()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      // The probes for the bars, 60px each.
      return (this.style.visibility === 'hidden' ? { top: 0, bottom: 60, height: 60 } : { top: 0, bottom: 0, height: 0 }) as DOMRect
    })
    renderHook(() => useInBand(element(), 1))
    expect(io.live()[0]!.options?.rootMargin).toBe('-60px 0px -60px 0px')
    expect(io.live()[0]!.options?.threshold).toEqual([1])
  })

  it('observes again when the screen is resized, and stops when it goes away', () => {
    const io = installFakeIntersectionObserver()
    const { unmount } = renderHook(() => useInBand(element(), 1))
    expect(io.live()).toHaveLength(1)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    // The old one is disconnected and a new one has the new margins.
    expect(io.observers).toHaveLength(2)
    expect(io.live()).toHaveLength(1)
    unmount()
    expect(io.live()).toHaveLength(0)
  })

  it('is false, and observes nothing, when disabled or where there is no observer', () => {
    const io = installFakeIntersectionObserver()
    const off = renderHook(() => useInBand(element(), 1, false))
    expect(off.result.current).toBe(false)
    expect(io.live()).toHaveLength(0)
    vi.unstubAllGlobals()
    expect(renderHook(() => useInBand(element(), 1)).result.current).toBe(false)
  })
})
