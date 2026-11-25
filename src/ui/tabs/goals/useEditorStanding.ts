import { useMemo } from 'react'
import type { ExpenseDataset, GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import { differsFrom, hasUnsavedEdits } from './scenarioDraft'
import { useBlankDraft } from './useBlankDraft'
import { useHiddenLines } from './useHiddenLines'

/**
 * What the editor's ids and draft amount to: the scenario loaded and the one the draft came from, whether either has
 * edits that leaving would drop, and which lines the chart hides.
 */
export function useEditorStanding(
  dataset: ExpenseDataset,
  { loadedId, baseId, draft }: { loadedId: number | null; baseId: number | null; draft: NewGoalScenario },
  first: { activeId: number | null; draft: NewGoalScenario },
): {
  activeScenario: GoalScenario | null
  activeId: number | null
  dirty: boolean
  hiddenIds: ReadonlySet<number>
  onToggleVisible: (id: number) => void
  clearBlank: () => void
  unsaved: boolean
} {
  // Two different "current" scenarios: the one loaded in the editor (activeId), and the
  // owner's plan, which Progress measures against. Exploring a path must not change
  // what you are being measured against.
  const activeScenario = useMemo(
    () => dataset.goalScenarios.find((s) => s.id === loadedId) ?? null,
    [dataset.goalScenarios, loadedId],
  )
  // A scenario deleted while it is loaded is not loaded any more: the numbers on screen stay,
  // as a draft with no saved scenario behind it, which is what the tabs and the buttons must
  // say. Reading the id from the state alone left them naming one that no longer exists.
  const activeId = activeScenario?.id ?? null
  const dirty = useMemo(() => activeScenario !== null && differsFrom(draft, activeScenario), [activeScenario, draft])
  const { hiddenIds, onToggleVisible } = useHiddenLines(dataset.goalScenarios, activeScenario, dirty)
  // A detached draft has no saved scenario of its own, so loading another one would drop
  // its edits just as surely; it is measured against the scenario it came from.
  const baseScenario = useMemo(
    () => dataset.goalScenarios.find((s) => s.id === baseId) ?? null,
    [dataset.goalScenarios, baseId],
  )
  // A draft with no saved scenario to compare with (a first-time user's, or one whose scenario was
  // deleted) is measured against how it started, so editing it counts as work that leaving loses.
  const { blank, clearBlank } = useBlankDraft(first, baseId, baseScenario, draft)
  const unsaved = hasUnsavedEdits({ dirty, loaded: activeScenario, base: baseScenario, blank, draft })
  return { activeScenario, activeId, dirty, hiddenIds, onToggleVisible, clearBlank, unsaved }
}
