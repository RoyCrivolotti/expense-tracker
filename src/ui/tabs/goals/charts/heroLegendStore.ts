import { useEffect, useSyncExternalStore } from 'react'
import type { GoalScenario } from '../../../../types'
import type { ChartSeries } from '../../../charts/LinearChart'
import { NO_HIDDEN, useChartLegendState, type ScenarioLine } from './heroLegendState'
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
 * at, or at the last year drawn while nothing is. Takes the line back when the chart goes.
 */
export function usePublishHeroLegend(
  store: HeroLegendStore | undefined,
  lines: ScenarioLine[],
  series: ChartSeries[],
  names: string[],
  years: number[],
  activeIndex: number | null,
  scenarios: GoalScenario[],
  hiddenIds: ReadonlySet<number> = NO_HIDDEN,
): void {
  const { legendItems } = useChartLegendState(lines, series, names, years, activeIndex ?? years.length - 1, scenarios, hiddenIds)
  useEffect(() => {
    store?.set(legendItems)
  }, [store, legendItems])
  useEffect(() => () => store?.set(NONE), [store])
}
