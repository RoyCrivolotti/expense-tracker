import type { GoalScenario } from '../../../types'

/** The owner's plan: what Progress and the dashboard measure against. Null until chosen. */
export function activePlan(scenarios: readonly GoalScenario[]): GoalScenario | null {
  return scenarios.find((s) => s.isActive) ?? null
}

/** Most recently saved scenario (highest sortOrder, then id). */
export function lastAddedScenario(scenarios: readonly GoalScenario[]): GoalScenario | null {
  if (scenarios.length === 0) return null
  return [...scenarios].sort((a, b) => b.sortOrder - a.sortOrder || b.id - a.id)[0] ?? null
}

/** What the editor opens on: the plan, else whatever was saved last. */
export function initialEditorScenario(scenarios: readonly GoalScenario[]): GoalScenario | null {
  return activePlan(scenarios) ?? lastAddedScenario(scenarios)
}
