import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCardFold } from './useCardFold'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('how the card was left', () => {
  it('is one line on a device that never opened it', () => {
    expect(renderHook(() => useCardFold()).result.current[0]).toBe(false)
  })

  it('stays open across a reload once it is opened, and folded once it is folded again', () => {
    const first = renderHook(() => useCardFold())
    act(() => first.result.current[1](true))
    expect(first.result.current[0]).toBe(true)
    first.unmount()

    const reloaded = renderHook(() => useCardFold())
    expect(reloaded.result.current[0]).toBe(true)
    act(() => reloaded.result.current[1](false))
    reloaded.unmount()

    expect(renderHook(() => useCardFold()).result.current[0]).toBe(false)
  })

  it('works for the visit where the browser keeps nothing, starting folded', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useCardFold())
    expect(result.current[0]).toBe(false)

    act(() => result.current[1](true))

    expect(result.current[0]).toBe(true)
  })
})
