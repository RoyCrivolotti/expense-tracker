import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStoppedSuggestionsForTests, useStoppedSuggestions } from './stoppedSuggestions'

const KEY = 'expense:stopped-recurring'
const GYM = { after: '2026-06-05', label: 'Gym' }

describe('useStoppedSuggestions', () => {
  beforeEach(() => {
    localStorage.clear()
    resetStoppedSuggestionsForTests()
  })
  afterEach(() => vi.restoreAllMocks())

  it('starts with nothing stopped', () => {
    const { result } = renderHook(() => useStoppedSuggestions())
    expect(result.current.stopped).toEqual({})
  })

  it('stops a series and keeps it stopped for the next page load', () => {
    const { result, unmount } = renderHook(() => useStoppedSuggestions())
    act(() => result.current.stop('gym|1|1|expense', GYM))
    expect(result.current.stopped).toEqual({ 'gym|1|1|expense': GYM })
    unmount()

    const next = renderHook(() => useStoppedSuggestions())
    expect(next.result.current.stopped).toEqual({ 'gym|1|1|expense': GYM })
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ 'gym|1|1|expense': GYM })
  })

  it('takes a series back without touching the others', () => {
    const { result } = renderHook(() => useStoppedSuggestions())
    act(() => {
      result.current.stop('gym|1|1|expense', GYM)
      result.current.stop('rent|1|2|expense', { after: '2026-06-01', label: 'Rent' })
    })
    act(() => result.current.restore('gym|1|1|expense'))
    expect(result.current.stopped).toEqual({ 'rent|1|2|expense': { after: '2026-06-01', label: 'Rent' } })
  })

  it('hands out the same object until something changes, so nothing re-renders for nothing', () => {
    const { result, rerender } = renderHook(() => useStoppedSuggestions())
    act(() => result.current.stop('gym|1|1|expense', GYM))
    const before = result.current.stopped
    rerender()
    expect(result.current.stopped).toBe(before)
  })

  it('tells every hook in the page, so the card and Settings agree', () => {
    const card = renderHook(() => useStoppedSuggestions())
    const settings = renderHook(() => useStoppedSuggestions())
    act(() => card.result.current.stop('gym|1|1|expense', GYM))
    expect(settings.result.current.stopped).toEqual({ 'gym|1|1|expense': GYM })
    act(() => settings.result.current.restore('gym|1|1|expense'))
    expect(card.result.current.stopped).toEqual({})
  })

  it('follows another tab changing the list', () => {
    const { result } = renderHook(() => useStoppedSuggestions())
    act(() => {
      localStorage.setItem(KEY, JSON.stringify({ 'gym|1|1|expense': GYM }))
      window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
    })
    expect(result.current.stopped).toEqual({ 'gym|1|1|expense': GYM })
  })

  it('ignores a storage event about something else', () => {
    const { result } = renderHook(() => useStoppedSuggestions())
    const before = result.current.stopped
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }))
    })
    expect(result.current.stopped).toBe(before)
  })

  describe('what is saved cannot be read', () => {
    it.each([
      ['not json', '{not json'],
      ['a list', '["gym"]'],
      ['a number', '5'],
    ])('starts empty for %s', (_name, raw) => {
      localStorage.setItem(KEY, raw)
      const { result } = renderHook(() => useStoppedSuggestions())
      expect(result.current.stopped).toEqual({})
    })

    it('keeps the entries that are whole and drops the ones that are not', () => {
      localStorage.setItem(
        KEY,
        JSON.stringify({ 'gym|1|1|expense': GYM, broken: { after: 5 }, other: 'x', none: null }),
      )
      const { result } = renderHook(() => useStoppedSuggestions())
      expect(result.current.stopped).toEqual({ 'gym|1|1|expense': GYM })
    })
  })

  describe('the browser refuses to save', () => {
    it('keeps the series stopped while the page is open', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota')
      })
      const { result } = renderHook(() => useStoppedSuggestions())
      act(() => result.current.stop('gym|1|1|expense', GYM))
      expect(result.current.stopped).toEqual({ 'gym|1|1|expense': GYM })
      expect(localStorage.getItem(KEY)).toBeNull()
    })

    it('carries on when the browser will not even read', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      const { result } = renderHook(() => useStoppedSuggestions())
      expect(result.current.stopped).toEqual({})
    })
  })
})
