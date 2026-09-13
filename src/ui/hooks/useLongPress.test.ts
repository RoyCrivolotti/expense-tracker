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
})
