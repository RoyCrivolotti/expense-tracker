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

export function duplicateScenario(
  scenario: NewGoalScenario,
  sortOrder: number,
  usedColors: readonly string[] = [],
): NewGoalScenario {
  return {
    ...scenario,
    name: `${scenario.name} (copy)`,
    sortOrder,
    color: pickScenarioColor(usedColors),
  }
}
