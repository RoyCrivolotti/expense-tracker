import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useHeldValue } from './useHeldValue'

describe('useHeldValue', () => {
  it('follows the value while live', () => {
    const { result, rerender } = renderHook(({ v }) => useHeldValue(v, true), { initialProps: { v: 1 } })
    rerender({ v: 2 })
    expect(result.current).toBe(2)
  })

  it('keeps the last value it was live for while it is not, and takes the newest one when it is live again', () => {
    const { result, rerender } = renderHook(({ v, live }) => useHeldValue(v, live), { initialProps: { v: 1, live: true } })
    rerender({ v: 2, live: false })
    rerender({ v: 3, live: false })
    expect(result.current).toBe(1)
    rerender({ v: 4, live: true })
    expect(result.current).toBe(4)
  })

  it('has nothing to give if it was never live', () => {
    const { result, rerender } = renderHook(({ v, live }) => useHeldValue(v, live), { initialProps: { v: 1, live: false } })
    expect(result.current).toBeUndefined()
    rerender({ v: 2, live: true })
    expect(result.current).toBe(2)
  })
})
