import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExpenseDataset, GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import type { ExpenseActions } from '../../actions'
import { duplicateScenario, pickScenarioColor } from '../../../engine'
import { useStartLater } from './useStartLater'

/**
 * Making a scenario from the draft (saved as new, a duplicate, or a copy that starts later) and opening it, one at a
 * time.
 */
export function useScenarioCreate(
  actions: ExpenseActions | undefined,
  dataset: ExpenseDataset,
  { activeId, draft }: { activeId: number | null; draft: NewGoalScenario },
  selectScenario: (scenario: GoalScenario) => void,
) {
  // What the editor held when a create started, to tell whether anything was touched while it ran.
  const live = useRef({ activeId, draft })
  useEffect(() => {
    live.current = { activeId, draft }
  })
  const creatingNow = useRef(false)
  const [creating, setCreating] = useState(false)
  // One create at a time, and the new scenario is opened only if nothing was touched while it was
  // being made: opening it replaces the draft, so an edit made in the meantime, or another
  // scenario opened, would be dropped without a word. A second press is the same copy twice.
  const createAndOpen = useCallback(
    async (input: NewGoalScenario) => {
      if (!actions || creatingNow.current) return
      creatingNow.current = true
      setCreating(true)
      const started = live.current
      try {
        const scenario = await actions.createScenario(input)
        if (live.current.activeId === started.activeId && live.current.draft === started.draft) selectScenario(scenario)
      } finally {
        creatingNow.current = false
        setCreating(false)
      }
    },
    [actions, selectScenario],
  )

  const onSaveDraft = useCallback(
    (name: string) => {
      const used = dataset.goalScenarios.map((s) => s.color)
      // The draft's own colour when no scenario has it; saved from another scenario's draft it is
      // that scenario's, and two lines of one colour cannot be told apart.
      const color = used.includes(draft.color) ? pickScenarioColor(used) : draft.color
      void createAndOpen({ ...draft, name, color, sortOrder: dataset.goalScenarios.length })
    },
    [createAndOpen, draft, dataset.goalScenarios],
  )

  const onDuplicate = useCallback(() => {
    const { goalScenarios } = dataset
    void createAndOpen(
      duplicateScenario(
        draft,
        goalScenarios.length,
        goalScenarios.map((s) => s.color),
        goalScenarios.map((s) => s.name),
      ),
    )
  }, [createAndOpen, dataset, draft])

  return { creating, onSaveDraft, onDuplicate, startLater: useStartLater(dataset, draft, createAndOpen) }
}
