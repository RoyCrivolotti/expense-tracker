import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useToggleIds } from './useToggleIds'

describe('useToggleIds', () => {
  it('adds an id not already present', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() => useToggleIds([1], onChange))

    act(() => result.current(2))

    expect(onChange).toHaveBeenCalledWith([1, 2])
  })

  it('removes an id already present', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() => useToggleIds([1, 2], onChange))

    act(() => result.current(2))

    expect(onChange).toHaveBeenCalledWith([1])
  })

  it('resyncs from a value the caller changes some other way', () => {
    const onChange = vi.fn()
    const { result, rerender } = renderHook(({ v }) => useToggleIds(v, onChange), {
      initialProps: { v: [1] },
    })

    rerender({ v: [] })
    act(() => result.current(1))

    expect(onChange).toHaveBeenLastCalledWith([1])
  })

  /**
   * The bug this hook exists to fix: toggling two different ids back to back,
   * before the caller's `value` prop has round-tripped back with the first
   * change, used to have the second toggle compute off the same stale array
   * and silently drop the first one.
   */
  it('does not lose the first toggle when a second fires before value updates', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() => useToggleIds([], onChange))

    act(() => {
      result.current(1)
      result.current(2)
    })

    expect(onChange).toHaveBeenLastCalledWith([1, 2])
  })

  /**
   * Same root cause, the single-id case: a rapid double-tap on one label
   * should add it then remove it, landing back where it started — not add it
   * twice over because both taps read the same "not yet in the array" value.
   */
  it('a rapid double-toggle of the same id is idempotent: add then remove', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() => useToggleIds([], onChange))

    act(() => {
      result.current(1)
      result.current(1)
    })

    expect(onChange).toHaveBeenLastCalledWith([])
  })
})
