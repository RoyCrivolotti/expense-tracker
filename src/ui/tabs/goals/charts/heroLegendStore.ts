import { useEffect, useSyncExternalStore } from 'react'
import { useChartLegendState, type LegendInput } from './heroLegendState'
import type { ScenarioLegendItem } from './ScenarioSeriesLegend'

/**
 * What the hero chart tells the scenario chips above it: each line's name, colour and value, at
 * the year being pointed at or, with none, the last year drawn. The chips are outside the chart's
 * card, so the chart publishes this and they read it; a year pointed at changes it on every move,
 * and going through a store keeps that to the chips, not to the page they are on.
 */
export interface HeroLegendStore {
  get: () => ScenarioLegendItem[]
  set: (items: ScenarioLegendItem[]) => void
  subscribe: (listener: () => void) => () => void
}

const NONE: ScenarioLegendItem[] = []

export function createHeroLegendStore(): HeroLegendStore {
  let items = NONE
  const listeners = new Set<() => void>()
  return {
    get: () => items,
    set: (next) => {
      if (next === items) return
      items = next
      listeners.forEach((listener) => listener())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** The lines the chart has published, none before it has. */
export function useHeroLegend(store: HeroLegendStore): ScenarioLegendItem[] {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}

/**
 * Publishes the chart's lines to the chips above it, with their values at the year being pointed
 * at, or at `restIndex` while nothing is (the last year drawn, or on a calendar the last year every
 * line reaches). Takes the line back when the chart goes.
 */
export function usePublishHeroLegend(
  store: HeroLegendStore | undefined,
  input: LegendInput,
  activeIndex: number | null,
  restIndex: number,
): void {
  const { legendItems } = useChartLegendState(input, activeIndex ?? restIndex)
  useEffect(() => {
    store?.set(legendItems)
  }, [store, legendItems])
  useEffect(() => () => store?.set(NONE), [store])
}
