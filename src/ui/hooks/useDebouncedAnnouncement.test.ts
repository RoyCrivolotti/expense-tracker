import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedAnnouncement } from './useDebouncedAnnouncement'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useDebouncedAnnouncement', () => {
  it('says nothing on load, so mounting does not read the count out', () => {
    const { result } = renderHook(() => useDebouncedAnnouncement('12 transactions match'))

    expect(result.current).toBe('')
  })

  it('announces once the value stops changing', () => {
    const { result, rerender } = renderHook(({ m }) => useDebouncedAnnouncement(m), {
      initialProps: { m: '12 transactions match' },
    })

    rerender({ m: '3 transactions match' })
    act(() => void vi.advanceTimersByTime(700))

    expect(result.current).toBe('3 transactions match')
  })

  it('skips the intermediate values while typing', () => {
    // "coffee" typed a letter at a time used to read a new total per keystroke.
    const { result, rerender } = renderHook(({ m }) => useDebouncedAnnouncement(m), {
      initialProps: { m: '120 transactions match' },
    })

    for (const n of [40, 12, 6, 3, 2]) {
      rerender({ m: `${n} transactions match` })
      act(() => void vi.advanceTimersByTime(100))
    }
    act(() => void vi.advanceTimersByTime(700))

    expect(result.current).toBe('2 transactions match')
  })
})
