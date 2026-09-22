import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EXIT_MS, setMotionDisabledForTests } from './motion'
import { usePopoverTrapPause } from './usePopoverTrapPause'

describe('usePopoverTrapPause', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setMotionDisabledForTests(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    setMotionDisabledForTests(true)
  })

  it('pauses at once, and un-pauses only after the popover has had time to leave', async () => {
    const { result } = renderHook(() => usePopoverTrapPause())

    act(() => result.current[1](true))
    expect(result.current[0]).toBe(true)

    act(() => result.current[1](false))
    expect(result.current[0]).toBe(true)

    await act(() => vi.advanceTimersByTimeAsync(EXIT_MS.popover - 1))
    expect(result.current[0]).toBe(true)

    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(result.current[0]).toBe(false)
  })

  it('stays paused when a second popover opens inside the first one\'s un-pause window', async () => {
    // The bug this hook exists for: close the date popover, open the flag popover within
    // the exit window, and a per-field timer would have un-paused the trap under the
    // still-open flag popover — Escape then closed the whole editor.
    const { result } = renderHook(() => usePopoverTrapPause())

    act(() => result.current[1](true))
    act(() => result.current[1](false))
    act(() => result.current[1](true))

    await act(() => vi.advanceTimersByTimeAsync(EXIT_MS.popover * 2))
    expect(result.current[0]).toBe(true)
  })

  it('a reopen then a close still un-pauses on the later close\'s clock', async () => {
    const { result } = renderHook(() => usePopoverTrapPause())

    act(() => result.current[1](true))
    act(() => result.current[1](false))
    await act(() => vi.advanceTimersByTimeAsync(EXIT_MS.popover / 2))
    act(() => result.current[1](true))
    act(() => result.current[1](false))

    await act(() => vi.advanceTimersByTimeAsync(EXIT_MS.popover - 1))
    expect(result.current[0]).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(result.current[0]).toBe(false)
  })

  it('un-pauses without waiting for a viewer who asked for less movement', async () => {
    setMotionDisabledForTests(true)
    const { result } = renderHook(() => usePopoverTrapPause())

    act(() => result.current[1](true))
    act(() => result.current[1](false))

    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(result.current[0]).toBe(false)
  })
})
