import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useQuietValue } from './useQuietValue'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useQuietValue', () => {
  it('returns the first value at once', () => {
    expect(renderHook(() => useQuietValue('a', 250)).result.current).toBe('a')
  })

  it('keeps the value before until the edits have stopped for the wait, then gives the last one', () => {
    const { result, rerender } = renderHook(({ v }) => useQuietValue(v, 250), { initialProps: { v: 1 } })
    rerender({ v: 2 })
    act(() => void vi.advanceTimersByTime(200))
    rerender({ v: 3 })
    act(() => void vi.advanceTimersByTime(200))
    // 400 ms since the first change, but only 200 since the last: still the first value.
    expect(result.current).toBe(1)
    act(() => void vi.advanceTimersByTime(50))
    expect(result.current).toBe(3)
  })

  it('gives the value as it comes for a wait of 0', () => {
    const { result, rerender } = renderHook(({ v }) => useQuietValue(v, 0), { initialProps: { v: 1 } })
    rerender({ v: 2 })
    expect(result.current).toBe(2)
  })

  it('leaves no timer running after it unmounts', () => {
    const { rerender, unmount } = renderHook(({ v }) => useQuietValue(v, 250), { initialProps: { v: 1 } })
    rerender({ v: 2 })
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
