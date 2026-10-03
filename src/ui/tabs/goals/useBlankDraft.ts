import { useCallback, useState } from 'react'
import type { GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'

/**
 * The draft a user with nothing saved started from, so that editing it can be told from not
 * having touched it: a first-time user's seeded draft, or what a deleted scenario left on screen.
 * Null while there is a saved scenario to measure the edits against. `seed` is what the editor
 * opened on and `baseId` the scenario the draft was last loaded from.
 */
export function useBlankDraft(
  seed: { activeId: number | null; draft: NewGoalScenario },
  baseId: number | null,
  baseScenario: GoalScenario | null,
  draft: NewGoalScenario,
): { blank: NewGoalScenario | null; clearBlank: () => void } {
  const [blank, setBlank] = useState<NewGoalScenario | null>(() => (seed.activeId === null ? seed.draft : null))
  // The draft as it stands when its scenario is found gone is the start of the one that replaces it.
  if (blank === null && baseId !== null && baseScenario === null) setBlank(draft)
  const clearBlank = useCallback(() => setBlank(null), [])
  return { blank, clearBlank }
}
