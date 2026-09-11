import { act, renderHook } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { makeDataset, makeFlag } from '../../testing/factories'
import { buildLookup } from '../format'
import type { ExpenseModel } from '../useExpenseData'
import { useTransactionsTabState } from './useTransactionsTabState'

const work = makeFlag({ id: 1, name: 'Work travel' })

// useIsMobile reads matchMedia, which jsdom does not implement.
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  })
})

function modelWith(flags = [work]): ExpenseModel {
  const dataset = makeDataset({ flags })
  return {
    dataset,
    lookup: buildLookup(dataset),
    descriptionIndex: { search: () => [], resolve: () => undefined },
    months: [],
  }
}

describe('useTransactionsTabState — flag filter', () => {
  it('keeps a flag filter that still resolves', () => {
    const { result } = renderHook(() => useTransactionsTabState(modelWith(), '2026-05'))

    act(() => result.current.setFlagId(1))

    expect(result.current.flagId).toBe(1)
    expect(result.current.hasActiveFilters).toBe(true)
  })

  it('falls back to "all" when the filtered flag no longer exists', () => {
    // Deleting a flag from the Flagged card's own Manage modal leaves the tab
    // filtered to a dead id; a stored one would show "All flags" in the select
    // while the list rendered nothing.
    const { result, rerender } = renderHook(({ model }) => useTransactionsTabState(model, '2026-05'), {
      initialProps: { model: modelWith() },
    })

    act(() => result.current.setFlagId(1))
    expect(result.current.flagId).toBe(1)

    rerender({ model: modelWith([]) })

    expect(result.current.flagId).toBe('all')
    expect(result.current.hasActiveFilters).toBe(false)
    expect(result.current.secondaryFilterCount).toBe(0)
  })

  it('leaves the unflagged sentinel alone — it names no flag to resolve', () => {
    const { result } = renderHook(() => useTransactionsTabState(modelWith([]), '2026-05'))

    act(() => result.current.setFlagId('none'))

    expect(result.current.flagId).toBe('none')
  })
})
