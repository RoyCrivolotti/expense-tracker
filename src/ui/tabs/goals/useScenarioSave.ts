import { useCallback, useRef, useState } from 'react'
import type { NewGoalScenario } from '../../../data/dataSource'
import type { ExpenseActions } from '../../actions'
import { useToast } from '../../hooks/useToast'

/**
 * Writes the draft over the scenario it was loaded from, and says so. One write at a time: a
 * second Save, or a Discard, while one is in flight leaves the editor showing something other
 * than what the server holds. A failed write is not caught here, so the global failure toast
 * reports it and the buttons come back.
 */
export function useScenarioSave(
  actions: ExpenseActions | undefined,
  activeId: number | null,
  draft: NewGoalScenario,
  name: string,
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
      .updateScenario(activeId, draft)
      .then(() => showToast(`Saved ${name}`, 'success'))
      .finally(() => {
        inFlight.current = false
        setSaving(false)
      })
  }, [actions, activeId, draft, name, showToast])

  return { save, saving }
}
