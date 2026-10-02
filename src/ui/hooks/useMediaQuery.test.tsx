import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installFakeMatchMedia } from '../../testing/fakeMatchMedia'
import { useMediaQuery } from './useMediaQuery'

const QUERY = '(max-width: 500px)'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useMediaQuery', () => {
  it('starts from whether the query matches now', () => {
    installFakeMatchMedia((query) => query === QUERY)

    expect(renderHook(() => useMediaQuery(QUERY)).result.current).toBe(true)
    expect(renderHook(() => useMediaQuery('(min-width: 900px)')).result.current).toBe(false)
  })

  it('follows the query as it starts and stops matching', () => {
    const media = installFakeMatchMedia()
    const { result } = renderHook(() => useMediaQuery(QUERY))
    expect(result.current).toBe(false)

    act(() => media.change(QUERY, true))
    expect(result.current).toBe(true)

    act(() => media.change(QUERY, false))
    expect(result.current).toBe(false)
  })

  it('stops listening when the component leaves', () => {
    const media = installFakeMatchMedia()
    const { result, unmount } = renderHook(() => useMediaQuery(QUERY))

    unmount()
    act(() => media.change(QUERY, true))

    expect(result.current).toBe(false)
  })

  it('says nothing matches where there is no matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined)

    expect(renderHook(() => useMediaQuery(QUERY)).result.current).toBe(false)
  })
})
