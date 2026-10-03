import { useCallback, useMemo, useState } from 'react'
import type { GoalScenario } from '../../../types'

/**
 * A loaded scenario with no edits is drawn as the editing line, so a hidden flag on it would leave
 * the legend showing a dimmed saved line beside "(editing)". Only an edited one has a saved line
 * of its own to hide, so the flag goes when the edits do, whichever way they end (Discard, Save,
 * put back by hand, a refresh) and when a flagged scenario is loaded.
 */
function withoutLoadedLine(hidden: ReadonlySet<number>, loaded: GoalScenario | null, dirty: boolean): ReadonlySet<number> {
  if (loaded === null || dirty || !hidden.has(loaded.id)) return hidden
  const next = new Set(hidden)
  next.delete(loaded.id)
  return next
}

/**
 * Which saved scenarios' lines are hidden on the chart, by hand from the legend or the chips.
 * A line is forgotten with its scenario, and with the edits that gave the loaded scenario a saved
 * line to hide. The same set comes back while nothing in it has gone, so what is keyed on it (the
 * chart's lines) does not redo its work.
 */
export function useHiddenLines(scenarios: GoalScenario[], loaded: GoalScenario | null, dirty: boolean) {
  const [hidden, setHidden] = useState<ReadonlySet<number>>(() => new Set())
  const kept = withoutLoadedLine(hidden, loaded, dirty)
  if (kept !== hidden) setHidden(kept)
  const hiddenIds = useMemo(() => {
    const known = new Set(scenarios.map((s) => s.id))
    return [...hidden].every((id) => known.has(id)) ? hidden : new Set([...hidden].filter((id) => known.has(id)))
  }, [hidden, scenarios])
  const onToggleVisible = useCallback((id: number) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  return { hiddenIds, onToggleVisible }
}
