import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseModel } from './useExpenseData'
import { useHistoryWatch } from './useHistoryWatch'

describe('useHistoryWatch', () => {
  it('says the screen uses the history once it is mounted, and that it is gone when it unmounts', () => {
    const stop = vi.fn()
    const watchHistory = vi.fn(() => stop)
    const { rerender, unmount } = renderHook(() => useHistoryWatch({ watchHistory } as unknown as ExpenseModel))
    expect(watchHistory).toHaveBeenCalledTimes(1)
    rerender()
    expect(watchHistory).toHaveBeenCalledTimes(1)
    unmount()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('does nothing for a model that works its history out from the rows', () => {
    expect(() => renderHook(() => useHistoryWatch({} as ExpenseModel)).unmount()).not.toThrow()
  })
})
