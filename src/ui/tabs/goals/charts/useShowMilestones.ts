import { useCallback, useState } from 'react'

const STORAGE_KEY = 'exp-goals-show-milestones'

function readShown(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    /* private mode or blocked storage: the lines are on, as they are by default */
    return true
  }
}

/**
 * Whether the chart draws the milestone lines. They are on until someone turns them off to see the chart without
 * them, and the choice is kept on the device: it is a way of looking, not part of a plan.
 */
export function useShowMilestones(): [boolean, (shown: boolean) => void] {
  const [shown, setShownState] = useState(readShown)
  const setShown = useCallback((next: boolean) => {
    setShownState(next)
    try {
      if (next) localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, 'off')
    } catch {
      /* the choice holds for this visit */
    }
  }, [])
  return [shown, setShown]
}
