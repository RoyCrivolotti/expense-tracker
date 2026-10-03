import type { NewGoalScenario } from '../data/dataSource'
import { SCENARIO_COLORS } from './projectionConstants'

/**
 * Pick a chart color that is distinct from the ones already in use. Walks the
 * curated palette first (hand-spaced around the hue wheel for separation); once
 * it is exhausted, generates an evenly-spaced hue via the golden angle so extra
 * scenarios stay as far apart as possible. Deterministic, so no collisions.
 */
export function pickScenarioColor(usedColors: readonly string[]): string {
  const used = new Set(usedColors)
  const free = SCENARIO_COLORS.find((c) => !used.has(c))
  if (free) return free
  const hue = Math.round((usedColors.length * 137.508) % 360)
  return `hsl(${hue} 70% 55%)`
}

/** "Path A" becomes "Path A (copy)", and a copy of a copy counts up ("Path A (copy 2)") instead of stacking "(copy) (copy)". */
export function copyName(name: string): string {
  const match = /^(.*) \(copy(?: (\d+))?\)$/.exec(name)
  if (!match) return `${name} (copy)`
  return `${match[1] ?? ''} (copy ${Number(match[2] ?? 1) + 1})`
}

export function duplicateScenario(
  scenario: NewGoalScenario,
  sortOrder: number,
  usedColors: readonly string[] = [],
): NewGoalScenario {
  return {
    ...scenario,
    name: copyName(scenario.name),
    sortOrder,
    color: pickScenarioColor(usedColors),
  }
}
