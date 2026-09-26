import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installFakeIntersectionObserver } from '../../testing/fakeIntersectionObserver'
import { useInBand } from './useInBand'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const element = () => ({ current: document.createElement('div') })
/** A hook under test, with its own target that stays the same between renders, as a ref does. */
const watch = (...args: [number, Parameters<typeof useInBand>[2]?]) => {
  const target = element()
  return renderHook(() => useInBand(target, ...args))
}

describe('useInBand', () => {
  it('follows what the observer reports, against the share asked for', () => {
    const io = installFakeIntersectionObserver()
    const { result } = watch(1)
    expect(result.current).toBe(false)
    act(() => io.emit(1))
    expect(result.current).toBe(true)
    // Mostly in, but the share asked for is all of it.
    act(() => io.emit(0.8))
    expect(result.current).toBe(false)
    const partly = watch(0.4)
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
    watch(1)
    expect(io.live()[0]!.options?.rootMargin).toBe('-60px 0px -60px 0px')
    // The slack is a threshold too, so a ratio that lands just under 1 is reported again as it falls.
    expect(io.live()[0]!.options?.threshold).toEqual([0.99, 1])
  })

  it('observes again when the screen is resized, and stops when it goes away', () => {
    const io = installFakeIntersectionObserver()
    const { unmount } = watch(1)
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

  it('is false, and observes nothing, when disabled', () => {
    const io = installFakeIntersectionObserver()
    const off = watch(1, { enabled: false })
    expect(off.result.current).toBe(false)
    expect(io.live()).toHaveLength(0)
  })

  it('answers the fallback where there is no observer, and false without one asked for', () => {
    expect(watch(1).result.current).toBe(false)
    expect(watch(1, { fallback: true }).result.current).toBe(true)
    // Disabled beats the fallback.
    expect(watch(1, { enabled: false, fallback: true }).result.current).toBe(false)
    // And a missing target is not an error.
    expect(renderHook(() => useInBand(undefined, 1, { fallback: true })).result.current).toBe(true)
  })

  it('knows at once how much of the element is in the band, without waiting a frame for the observer', () => {
    installFakeIntersectionObserver()
    // The probes for the bars are 60px each; the element is what the test places.
    let box = { top: 100, bottom: 200 }
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return (this.style.visibility === 'hidden' ? { top: 0, bottom: 60, height: 60 } : { ...box, height: box.bottom - box.top }) as DOMRect
    })
    expect(watch(1).result.current).toBe(true)
    // Half of it under the header.
    box = { top: 10, bottom: 110 }
    expect(watch(1).result.current).toBe(false)
    expect(watch(0.4).result.current).toBe(true)
    // Off the screen.
    box = { top: -300, bottom: -200 }
    expect(watch(0.4).result.current).toBe(false)
  })
})
