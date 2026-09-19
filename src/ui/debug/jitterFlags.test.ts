import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyJx, jxActive, jxOn, useJx } from './jitterFlags'

describe('jitter flags', () => {
  afterEach(() => {
    applyJx([])
    vi.restoreAllMocks()
  })

  it('exposes the active switches on <html> and reports them', () => {
    applyJx(['stickyOff', 'tapOff'])

    expect(document.documentElement.dataset.jx).toBe('stickyOff tapOff')
    expect(jxActive()).toEqual(['stickyOff', 'tapOff'])
    expect(jxOn('tapOff')).toBe(true)
    expect(jxOn('fabOff')).toBe(false)
  })

  it('persists the switches so they survive a reload', () => {
    applyJx(['clipOff'])

    expect(localStorage.getItem('jitterLab')).toBe('["clipOff"]')
  })

  it('carries on when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(() => applyJx(['clipOff'])).not.toThrow()
    expect(jxOn('clipOff')).toBe(true)
  })

  it('re-renders a component when its switch changes', () => {
    const { result } = renderHook(() => useJx('plainRows'))
    expect(result.current).toBe(false)

    act(() => applyJx(['plainRows']))
    expect(result.current).toBe(true)
  })
})
