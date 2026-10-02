import { useEffect, useMemo, useRef } from 'react'
import type { GoalsMobileView } from './goalsView'
import { restoreScrollPosition } from './scrollToGoalsContent'
import { useGoalsNarrow } from './useGoalsNarrow'

/** Where each of the phone's views was when it was last left. */
export interface GoalsScrollMemory {
  /** Note where the page is as `from` is left, by whatever route leaves it. */
  leave: (from: GoalsMobileView) => void
  /** Put `view` back where it was left, once it has been rendered; false if it has not been left. */
  recall: (view: GoalsMobileView) => boolean
}

/**
 * The scroll position each Goals view was left at, so tapping back to it lands where the
 * viewer was. It belongs to the tab rather than to the phone's row: a link that jumps to
 * another view leaves one without touching the row, and the row is gone when the window is
 * widened. Offsets from one width mean nothing at the other, so crossing the breakpoint
 * forgets them.
 */
export function useGoalsScrollMemory(): GoalsScrollMemory {
  const narrow = useGoalsNarrow()
  const left = useRef<Partial<Record<GoalsMobileView, number>>>({})
  useEffect(() => {
    left.current = {}
  }, [narrow])

  return useMemo(
    () => ({
      leave: (from) => {
        left.current[from] = window.scrollY
      },
      recall: (view) => {
        const top = left.current[view]
        if (top === undefined) return false
        restoreScrollPosition(top)
        return true
      },
    }),
    [],
  )
}
