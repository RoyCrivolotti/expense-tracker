import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutoHideFab } from './useAutoHideFab'

function fireScroll() {
  window.dispatchEvent(new Event('scroll'))
}

describe('useAutoHideFab', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts visible', () => {
    const { result } = renderHook(() => useAutoHideFab(true))
    expect(result.current).toBe(true)
  })

  it('hides on scroll and reappears after the page settles', () => {
    const { result } = renderHook(() => useAutoHideFab(true))

    void act(() => fireScroll())
    expect(result.current).toBe(false)

    void act(() => vi.advanceTimersByTime(249))
    expect(result.current).toBe(false)

    void act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(true)
  })

  it('resets the timer on repeated scroll events instead of reappearing early', () => {
    const { result } = renderHook(() => useAutoHideFab(true))

    void act(() => fireScroll())
    void act(() => vi.advanceTimersByTime(200))
    void act(() => fireScroll())
    void act(() => vi.advanceTimersByTime(200))
    expect(result.current).toBe(false)

    void act(() => vi.advanceTimersByTime(50))
    expect(result.current).toBe(true)
  })

  it('stays visible and ignores scroll events when disabled', () => {
    const { result } = renderHook(() => useAutoHideFab(false))

    void act(() => fireScroll())
    void act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe(true)
  })

  it('removes its scroll listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useAutoHideFab(true))

    unmount()

    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function))
  })
})
