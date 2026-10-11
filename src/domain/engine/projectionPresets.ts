import type { NewGoalScenario } from '../data/dataSource'
import { SCENARIO_COLORS, SCENARIO_NAME_MAX_LENGTH } from './projectionConstants'

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

/** The base cut so base plus suffix fits the name limit the server enforces, which a copy of a long name would otherwise break. */
function withSuffix(base: string, suffix: string): string {
  return `${base.slice(0, SCENARIO_NAME_MAX_LENGTH - suffix.length).trimEnd()}${suffix}`
}

/** The name one copy on from this one: "Path A" becomes "Path A (copy)", and a copy of a copy counts up ("Path A (copy 2)"). */
function nextCopyName(name: string): string {
  const match = /^(.*) \(copy(?: (\d+))?\)$/.exec(name)
  if (!match) return withSuffix(name, ' (copy)')
  return withSuffix(match[1] ?? '', ` (copy ${Number(match[2] ?? 1) + 1})`)
}

/** What the Save as new box starts with: the name and "copy", cut to fit the limit. */
export function saveAsNewName(name: string): string {
  return withSuffix(name, ' copy')
}

/** A copy's name, counting on past the copies that already exist so no two are alike. */
export function copyName(name: string, taken: readonly string[] = []): string {
  let candidate = nextCopyName(name)
  while (taken.includes(candidate)) candidate = nextCopyName(candidate)
  return candidate
}

export function duplicateScenario(
  scenario: NewGoalScenario,
  sortOrder: number,
  usedColors: readonly string[] = [],
  usedNames: readonly string[] = [],
): NewGoalScenario {
  return {
    ...scenario,
    name: copyName(scenario.name, usedNames),
    sortOrder,
    color: pickScenarioColor(usedColors),
  }
}
