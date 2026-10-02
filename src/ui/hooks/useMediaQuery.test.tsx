import { act, render, renderHook, screen } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { renderToString } from 'react-dom/server'
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

  it('answers for the new query as soon as it changes, without waiting for a change event', () => {
    installFakeMatchMedia((query) => query === '(min-width: 900px)')
    const { result, rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: QUERY },
    })
    expect(result.current).toBe(false)

    rerender({ query: '(min-width: 900px)' })

    expect(result.current).toBe(true)
  })

  it('follows the new query after it changes, and no longer the old one', () => {
    const media = installFakeMatchMedia()
    const { result, rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: QUERY },
    })

    rerender({ query: '(min-width: 900px)' })
    act(() => media.change(QUERY, true))
    expect(result.current).toBe(false)

    act(() => media.change('(min-width: 900px)', true))
    expect(result.current).toBe(true)
  })

  it('picks up a change that happened after it rendered but before it started listening', () => {
    const media = installFakeMatchMedia()
    // Commits before the effects that subscribe, so the change is made where no listener hears it.
    function ChangesBeforeSubscribe() {
      useLayoutEffect(() => media.setMatching(() => true), [])
      return null
    }
    function Reader() {
      return <p>{useMediaQuery(QUERY) ? 'matches' : 'does not match'}</p>
    }

    render(
      <>
        <Reader />
        <ChangesBeforeSubscribe />
      </>,
    )

    expect(screen.getByText('matches')).toBeInTheDocument()
  })

  it('says nothing matches when rendered where there is no screen to ask', () => {
    installFakeMatchMedia(() => true)
    function Reader() {
      return <p>{useMediaQuery(QUERY) ? 'matches' : 'does not match'}</p>
    }

    expect(renderToString(<Reader />)).toContain('does not match')
  })

  it('says nothing matches where there is no matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined)

    expect(renderHook(() => useMediaQuery(QUERY)).result.current).toBe(false)
  })
})
