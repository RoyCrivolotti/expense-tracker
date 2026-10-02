import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useScrollMemory } from './useScrollMemory'

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

function setScrollY(y: number) {
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(y)
}

/** The frame the page is put back on runs at once. */
function runFramesNow() {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
}

describe('useScrollMemory', () => {
  it('puts a section back where it was left, and says so', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    runFramesNow()
    const { result } = renderHook(() => useScrollMemory<'a' | 'b'>())

    setScrollY(1360)
    result.current.leave('a')

    expect(result.current.recall('a')).toBe(true)
    expect(scrollTo).toHaveBeenCalledWith({ top: 1360, behavior: 'auto' })
  })

  it('keeps each section\'s own place', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    runFramesNow()
    const { result } = renderHook(() => useScrollMemory<'a' | 'b'>())

    setScrollY(300)
    result.current.leave('a')
    setScrollY(2000)
    result.current.leave('b')

    result.current.recall('a')
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 300, behavior: 'auto' })
    result.current.recall('b')
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 2000, behavior: 'auto' })
  })

  it('remembers a section left at the very top, which is not the same as one never left', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    runFramesNow()
    const { result } = renderHook(() => useScrollMemory<'a' | 'b'>())

    setScrollY(0)
    result.current.leave('a')

    expect(result.current.recall('a')).toBe(true)
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
  })

  it('has nothing to put back for a section that was never left', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    runFramesNow()
    const { result } = renderHook(() => useScrollMemory<'a' | 'b'>())

    expect(result.current.recall('b')).toBe(false)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('is the same object after a render, so a callback that holds it need not change', () => {
    const { result, rerender } = renderHook(() => useScrollMemory())
    const first = result.current

    rerender()

    expect(result.current).toBe(first)
  })

  it('forgets everything when the component that held it goes', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    runFramesNow()
    const first = renderHook(() => useScrollMemory<'a'>())
    setScrollY(500)
    first.result.current.leave('a')
    first.unmount()

    const second = renderHook(() => useScrollMemory<'a'>())

    expect(second.result.current.recall('a')).toBe(false)
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
