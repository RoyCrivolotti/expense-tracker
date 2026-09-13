import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useBodyScrollLock } from './useBodyScrollLock'
import { THRESHOLD_PX, usePullToRefresh } from './usePullToRefresh'

/** jsdom has no TouchEvent constructor, and the hook only ever reads `touches[0]`. */
function touch(type: string, clientY: number): Event {
  const event = new Event(type, { bubbles: true })
  Object.defineProperty(event, 'touches', { value: [{ clientY }] })
  return event
}

function setScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', { value, configurable: true })
}

/** A full downward drag: finger down at the top, moved `distance`, lifted. */
function pull(distance: number) {
  act(() => {
    window.dispatchEvent(touch('touchstart', 0))
    window.dispatchEvent(touch('touchmove', distance))
    window.dispatchEvent(touch('touchend', distance))
  })
}

describe('usePullToRefresh', () => {
  afterEach(() => {
    setScrollY(0)
  })

  it('refreshes after a pull past the threshold', () => {
    const onRefresh = vi.fn()
    renderHook(() => usePullToRefresh({ onRefresh }))

    pull(THRESHOLD_PX)

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('does not refresh on a pull that stops short', () => {
    const onRefresh = vi.fn()
    renderHook(() => usePullToRefresh({ onRefresh }))

    pull(THRESHOLD_PX - 1)

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('does not refresh when the page is scrolled away from the top', () => {
    const onRefresh = vi.fn()
    renderHook(() => usePullToRefresh({ onRefresh }))
    setScrollY(200)

    pull(THRESHOLD_PX)

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('stays out of the way while a sheet holds the body scroll lock', () => {
    // The regression: the lock pins `body` at `position: fixed`, so `scrollY` reads 0
    // however far down the page really is. Without the lock check the at-top gate is
    // permanently satisfied and scrolling a form inside the sheet refreshed the app.
    const onRefresh = vi.fn()
    renderHook(() => usePullToRefresh({ onRefresh }))
    const lock = renderHook(() => useBodyScrollLock(true))

    pull(THRESHOLD_PX)
    expect(onRefresh).not.toHaveBeenCalled()

    // ...and works again once the sheet closes.
    lock.unmount()
    pull(THRESHOLD_PX)
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('does not refresh when a sheet opens mid-drag', () => {
    const onRefresh = vi.fn()
    renderHook(() => usePullToRefresh({ onRefresh }))

    act(() => {
      window.dispatchEvent(touch('touchstart', 0))
      window.dispatchEvent(touch('touchmove', THRESHOLD_PX))
    })
    const lock = renderHook(() => useBodyScrollLock(true))
    act(() => {
      window.dispatchEvent(touch('touchend', THRESHOLD_PX))
    })

    expect(onRefresh).not.toHaveBeenCalled()
    lock.unmount()
  })

  it('does nothing while disabled or already refreshing', () => {
    const onRefresh = vi.fn()
    const disabled = renderHook(() => usePullToRefresh({ onRefresh, enabled: false }))
    pull(THRESHOLD_PX)
    expect(onRefresh).not.toHaveBeenCalled()
    disabled.unmount()

    renderHook(() => usePullToRefresh({ onRefresh, refreshing: true }))
    pull(THRESHOLD_PX)
    expect(onRefresh).not.toHaveBeenCalled()
  })
})
