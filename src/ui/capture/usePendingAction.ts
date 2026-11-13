import { useCallback, useEffect, useRef } from 'react'

/** How long the last action can be taken back. Nothing is sent to the server until it ends. */
export const UNDO_MS = 5000

/** One thing the person did that has not been sent yet. */
export interface PendingAction {
  /** Sends it. Settles once the server has answered. */
  commit: () => Promise<void>
  /** Puts back what the action hid. */
  undo: () => void
}

/**
 * Holds the last action for `UNDO_MS` so it can be undone, then sends it. A new action sends the held one at once, so
 * nothing waits behind another, and so does the app going out of sight, since a page that is hidden may be stopped
 * before a timer fires. Only one action is ever held.
 */
export function usePendingAction() {
  const held = useRef<PendingAction | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  /** Sends the held action now, if there is one. */
  const flush = useCallback(() => {
    const action = held.current
    held.current = null
    clear()
    if (action) void action.commit()
  }, [clear])

  /** Takes the held action back. False when there was nothing to take back. */
  const undo = useCallback(() => {
    const action = held.current
    held.current = null
    clear()
    action?.undo()
    return action !== null
  }, [clear])

  /** Holds a new action, sending any earlier one first. */
  const hold = useCallback(
    (action: PendingAction) => {
      flush()
      held.current = action
      timer.current = setTimeout(flush, UNDO_MS)
    },
    [flush],
  )

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  return { hold, undo, flush }
}
