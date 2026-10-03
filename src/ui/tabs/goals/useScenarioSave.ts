import { useCallback, useRef, useState } from 'react'
import type { GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import type { ExpenseActions } from '../../actions'
import { useToast } from '../../hooks/useToast'
import { editedPatch } from './scenarioDraft'

/**
 * Writes what was edited in the draft to the scenario it was loaded from (not the whole draft,
 * which would write back what another device has saved since), and says so. One write at a time: a
 * second Save, or a Discard, while one is in flight leaves the editor showing something other
 * than what the server holds. A failed write is not caught here, so the global failure toast
 * reports it and the buttons come back.
 */
export function useScenarioSave(
  actions: ExpenseActions | undefined,
  activeId: number | null,
  draft: NewGoalScenario,
  name: string,
  /** The scenario as saved now, which the edits are measured against. */
  saved: GoalScenario | null,
): { save: () => void; saving: boolean } {
  const { showToast } = useToast()
  const [saving, setSaving] = useState(false)
  // State updates after the next render, which a quick double tap can beat.
  const inFlight = useRef(false)

  const save = useCallback(() => {
    if (!actions || activeId == null || inFlight.current) return
    inFlight.current = true
    setSaving(true)
    void actions
      .updateScenario(activeId, saved ? editedPatch(draft, saved) : draft)
      .then(() => showToast(`Saved ${name}`, 'success'))
      .finally(() => {
        inFlight.current = false
        setSaving(false)
      })
  }, [actions, activeId, draft, name, saved, showToast])

  return { save, saving }
}
