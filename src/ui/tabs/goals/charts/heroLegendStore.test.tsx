import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createHeroLegendStore, useHeroLegend } from './heroLegendStore'
import type { ScenarioLegendItem } from './ScenarioSeriesLegend'

const item = (valueCents: number): ScenarioLegendItem => ({ label: 'Path A', color: '#10b981', valueCents })

describe('createHeroLegendStore', () => {
  it('holds what it was given, and tells its listeners when that changes', () => {
    const store = createHeroLegendStore()
    const listener = vi.fn()
    const off = store.subscribe(listener)
    expect(store.get()).toEqual([])

    const items = [item(1)]
    store.set(items)
    expect(store.get()).toBe(items)
    expect(listener).toHaveBeenCalledTimes(1)

    // The same list again is no change: nothing re-renders for it.
    store.set(items)
    expect(listener).toHaveBeenCalledTimes(1)

    off()
    store.set([item(2)])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('re-renders a reader of it only when the items change', () => {
    const store = createHeroLegendStore()
    const { result } = renderHook(() => useHeroLegend(store))
    expect(result.current).toEqual([])
    act(() => store.set([item(5)]))
    expect(result.current).toEqual([item(5)])
  })
})
