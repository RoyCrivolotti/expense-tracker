import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REPLAY_QUIET_MS, useReplayInput, useReplayInputOrLive } from './useReplayInput'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useReplayInput', () => {
  it('waits a quarter of a second after the last edit, not less', () => {
    expect(REPLAY_QUIET_MS).toBe(250)
    const { result, rerender } = renderHook(({ v }) => useReplayInput(v, false), { initialProps: { v: 'a' } })
    rerender({ v: 'b' })
    act(() => void vi.advanceTimersByTime(249))
    expect(result.current).toBe('a')
    act(() => void vi.advanceTimersByTime(1))
    expect(result.current).toBe('b')
  })

  it('keeps what it last read while paused, even after the wait, and reads the newest again when it is live', () => {
    const { result, rerender } = renderHook(({ v, paused }) => useReplayInput(v, paused), { initialProps: { v: 'a', paused: false } })
    rerender({ v: 'b', paused: true })
    act(() => void vi.advanceTimersByTime(1_000))
    expect(result.current).toBe('a')
    rerender({ v: 'b', paused: false })
    act(() => void vi.advanceTimersByTime(REPLAY_QUIET_MS))
    expect(result.current).toBe('b')
  })

  it('is nothing for a card that has never been live, and the live value where something must be read', () => {
    expect(renderHook(() => useReplayInput('a', true)).result.current).toBeUndefined()
    expect(renderHook(() => useReplayInputOrLive('a', true)).result.current).toBe('a')
  })
})
