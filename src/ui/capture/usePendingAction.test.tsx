import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UNDO_MS, usePendingAction, type PendingAction } from './usePendingAction'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const action = () => ({
  commit: vi.fn<PendingAction['commit']>().mockResolvedValue(undefined),
  undo: vi.fn<PendingAction['undo']>(),
})

describe('usePendingAction', () => {
  it('sends nothing before the undo window ends, then sends once', () => {
    const { result } = renderHook(() => usePendingAction())
    const a = action()

    act(() => result.current.hold(a))
    act(() => void vi.advanceTimersByTime(UNDO_MS - 1))
    expect(a.commit).not.toHaveBeenCalled()

    act(() => void vi.advanceTimersByTime(1))
    expect(a.commit).toHaveBeenCalledOnce()
    act(() => void vi.advanceTimersByTime(UNDO_MS * 3))
    expect(a.commit).toHaveBeenCalledOnce()
  })

  it('takes an action back so it is never sent', () => {
    const { result } = renderHook(() => usePendingAction())
    const a = action()
    act(() => result.current.hold(a))

    let undone = false
    act(() => {
      undone = result.current.undo()
    })
    act(() => void vi.advanceTimersByTime(UNDO_MS * 2))

    expect(undone).toBe(true)
    expect(a.undo).toHaveBeenCalledOnce()
    expect(a.commit).not.toHaveBeenCalled()
  })

  it('says there was nothing to undo when nothing is held', () => {
    const { result } = renderHook(() => usePendingAction())

    expect(result.current.undo()).toBe(false)
  })

  it('sends the earlier action at once when a new one comes, and undo then covers only the new one', () => {
    const { result } = renderHook(() => usePendingAction())
    const first = action()
    const second = action()
    act(() => result.current.hold(first))

    act(() => result.current.hold(second))
    expect(first.commit).toHaveBeenCalledOnce()
    act(() => void result.current.undo())

    expect(second.undo).toHaveBeenCalledOnce()
    expect(first.undo).not.toHaveBeenCalled()
    expect(second.commit).not.toHaveBeenCalled()
  })

  it('does not restart the window for the earlier action when a new one comes', () => {
    const { result } = renderHook(() => usePendingAction())
    const first = action()
    const second = action()
    act(() => result.current.hold(first))
    act(() => void vi.advanceTimersByTime(UNDO_MS - 100))
    act(() => result.current.hold(second))
    act(() => void vi.advanceTimersByTime(UNDO_MS - 1))

    expect(first.commit).toHaveBeenCalledOnce()
    expect(second.commit).not.toHaveBeenCalled()
  })

  it('sends the held action when the app goes out of sight', () => {
    const { result } = renderHook(() => usePendingAction())
    const a = action()
    act(() => result.current.hold(a))

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })

    expect(a.commit).toHaveBeenCalledOnce()
  })

  it('ignores the app coming back into sight', () => {
    const { result } = renderHook(() => usePendingAction())
    const a = action()
    act(() => result.current.hold(a))

    act(() => void document.dispatchEvent(new Event('visibilitychange')))

    expect(a.commit).not.toHaveBeenCalled()
  })

  it('sends the held action on pagehide and when the screen unmounts', () => {
    const { result, unmount } = renderHook(() => usePendingAction())
    const a = action()
    act(() => result.current.hold(a))
    act(() => void window.dispatchEvent(new Event('pagehide')))
    expect(a.commit).toHaveBeenCalledOnce()

    const b = action()
    act(() => result.current.hold(b))
    unmount()
    expect(b.commit).toHaveBeenCalledOnce()
  })

  it('flush with nothing held does nothing', () => {
    const { result } = renderHook(() => usePendingAction())

    expect(() => act(() => result.current.flush())).not.toThrow()
  })
})
