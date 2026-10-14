import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useLongPress } from './useLongPress'
import type { TouchEvent } from 'react'

function touch(x: number, y: number) {
  return { touches: [{ clientX: x, clientY: y }] } as unknown as TouchEvent
}

function touchEnd() {
  const prevented = { called: false }
  const e = {
    touches: [],
    preventDefault: () => {
      prevented.called = true
    },
  } as unknown as TouchEvent
  return { e, prevented }
}

describe('useLongPress', () => {
  let vibrateSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    vibrateSpy = vi.fn()
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateSpy,
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    // A fired long press arms a window-level click catcher; a touch stands it down, so one
    // test's leftover cannot swallow the next test's click.
    window.dispatchEvent(new Event('touchstart'))
    vi.useRealTimers()
  })

  it('fires onLongPress after the delay', async () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress({ onLongPress }))

    act(() => result.current.onTouchStart(touch(100, 200)))
    expect(onLongPress).not.toHaveBeenCalled()

    await act(() => vi.advanceTimersByTime(400))
    expect(onLongPress).toHaveBeenCalledOnce()
  })

  it('triggers haptic feedback on fire', async () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress({ onLongPress }))

    act(() => result.current.onTouchStart(touch(100, 200)))
    await act(() => vi.advanceTimersByTime(400))
    expect(vibrateSpy).toHaveBeenCalledWith(50)
  })

  it('cancels if finger moves beyond threshold', async () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress({ onLongPress, moveThreshold: 10 }))

    act(() => result.current.onTouchStart(touch(100, 200)))
    act(() => result.current.onTouchMove(touch(115, 200)))
    await act(() => vi.advanceTimersByTime(400))
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('does not cancel for small movements within threshold', async () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress({ onLongPress, moveThreshold: 10 }))

    act(() => result.current.onTouchStart(touch(100, 200)))
    act(() => result.current.onTouchMove(touch(105, 203)))
    await act(() => vi.advanceTimersByTime(400))
    expect(onLongPress).toHaveBeenCalledOnce()
  })

  it('suppresses click via preventDefault on touchEnd after firing', async () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress({ onLongPress }))

    act(() => result.current.onTouchStart(touch(100, 200)))
    await act(() => vi.advanceTimersByTime(400))

    const { e, prevented } = touchEnd()
    act(() => result.current.onTouchEnd(e))
    expect(prevented.called).toBe(true)
  })

  it('does not preventDefault on touchEnd if not fired', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress({ onLongPress }))

    act(() => result.current.onTouchStart(touch(100, 200)))
    const { e, prevented } = touchEnd()
    act(() => result.current.onTouchEnd(e))
    expect(prevented.called).toBe(false)
  })

  it('cancels on touchCancel', async () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress({ onLongPress }))

    act(() => result.current.onTouchStart(touch(100, 200)))
    act(() => result.current.onTouchCancel())
    await act(() => vi.advanceTimersByTime(400))
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('ignores touchMove when timer is not active', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress({ onLongPress }))

    act(() => result.current.onTouchMove(touch(200, 300)))
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('respects custom delay', async () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress({ onLongPress, delay: 200 }))

    act(() => result.current.onTouchStart(touch(0, 0)))
    await act(() => vi.advanceTimersByTime(199))
    expect(onLongPress).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTime(1))
    expect(onLongPress).toHaveBeenCalledOnce()
  })

  describe('the click after a long press', () => {
    const fire = async () => {
      const { result } = renderHook(() => useLongPress({ onLongPress: vi.fn() }))
      act(() => result.current.onTouchStart(touch(100, 200)))
      await act(() => vi.advanceTimersByTime(400))
    }
    const click = () => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true })
      document.body.dispatchEvent(event)
      return event
    }

    it('is dropped before it reaches the page, even when touchend never arrived', async () => {
      const seen = vi.fn()
      document.addEventListener('click', seen)
      await fire()

      const lift = click()
      expect(lift.defaultPrevented).toBe(true)
      expect(seen).not.toHaveBeenCalled()
      document.removeEventListener('click', seen)
    })

    it('is the only click dropped', async () => {
      await fire()
      click()
      expect(click().defaultPrevented).toBe(false)
    })

    it('is not waited for once a new touch starts', async () => {
      await fire()
      window.dispatchEvent(new Event('touchstart'))
      expect(click().defaultPrevented).toBe(false)
    })

    it('is not waited for past the window', async () => {
      await fire()
      await act(() => vi.advanceTimersByTime(5000))
      expect(click().defaultPrevented).toBe(false)
    })

    it('leaves clicks alone when no long press fired', () => {
      const { result } = renderHook(() => useLongPress({ onLongPress: vi.fn() }))
      act(() => result.current.onTouchStart(touch(100, 200)))
      act(() => result.current.onTouchMove(touch(150, 200)))
      expect(click().defaultPrevented).toBe(false)
    })
  })
})
