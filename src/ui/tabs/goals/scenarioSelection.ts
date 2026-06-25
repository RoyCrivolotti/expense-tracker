import type { GoalScenario } from '../../../types'

const STORAGE_KEY = 'expense-tracker:goals-selected-scenario-id'

/** Most recently saved scenario (highest sortOrder, then id). */
export function lastAddedScenario(scenarios: readonly GoalScenario[]): GoalScenario | null {
  if (scenarios.length === 0) return null
  return [...scenarios].sort((a, b) => b.sortOrder - a.sortOrder || b.id - a.id)[0] ?? null
}

export function readPinnedScenarioId(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw == null) return null
    const id = Number(raw)
    return Number.isFinite(id) ? id : null
  } catch {
    return null
  }
}

export function writePinnedScenarioId(id: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(id))
  } catch {
    // localStorage unavailable (private mode, SSR) — ignore
  }
}

/** Dashboard teaser: last user-selected scenario, else last added. */
export function resolveDashboardScenario(
  scenarios: readonly GoalScenario[],
): GoalScenario | null {
  if (scenarios.length === 0) return null
  const pinnedId = readPinnedScenarioId()
  if (pinnedId != null) {
    const pinned = scenarios.find((s) => s.id === pinnedId)
    if (pinned) return pinned
  }
  return lastAddedScenario(scenarios)
}
