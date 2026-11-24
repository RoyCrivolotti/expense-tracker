import { useCallback, useState } from 'react'
import type { GoalScenario } from '../../../types'
import type { DiscardPrompt } from './useScenarioEditor'

/**
 * Opening a scenario from the tabs: at once, or behind the question when it would drop unsaved edits, and the
 * question itself as the sheet reads it.
 */
export function useDiscardPrompt({
  activeId,
  unsaved,
  selectScenario,
  canSave,
  name,
}: {
  activeId: number | null
  unsaved: boolean
  selectScenario: (scenario: GoalScenario) => void
  canSave: boolean
  name: string
}): { onSelectScenario: (scenario: GoalScenario) => void; discardPrompt: DiscardPrompt } {
  // Loading another scenario replaces the draft, so unsaved edits are held back behind a
  // question. Held as its own value so the sheet keeps its text while it animates out.
  const [pendingSelect, setPendingSelect] = useState<GoalScenario | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const onSelectScenario = useCallback(
    (scenario: GoalScenario) => {
      if (scenario.id === activeId) return
      if (unsaved) {
        setPendingSelect(scenario)
        setDiscardOpen(true)
        return
      }
      selectScenario(scenario)
    },
    [activeId, unsaved, selectScenario],
  )
  const onDiscardAndSelect = useCallback(() => {
    setDiscardOpen(false)
    if (pendingSelect) selectScenario(pendingSelect)
  }, [pendingSelect, selectScenario])
  const onCancelDiscard = useCallback(() => setDiscardOpen(false), [])

  return {
    onSelectScenario,
    discardPrompt: {
      pending: pendingSelect,
      open: discardOpen,
      detached: activeId === null,
      canSave,
      name,
      onConfirm: onDiscardAndSelect,
      onCancel: onCancelDiscard,
    },
  }
}
