import { useCallback, useRef, useState } from 'react'
import { EXIT_MS, afterExit } from './motion'

/**
 * `trapPaused` for a Modal whose fields open popovers that portal out of it.
 *
 * Pausing follows an opening popover at once; un-pausing waits out the popover's exit,
 * because a closed popover stays mounted, portalled outside the Modal, while it animates
 * away — re-arming the trap earlier lets it fight something outside its own container
 * that can still hold focus.
 *
 * The deferral lives here, at the single owner, and not in each field: a field deferring
 * its own `false` races the other fields on the shared paused state. Close the date
 * popover and open the flag popover inside that window, and the date field's late timer
 * un-pauses the trap under a popover that is still open — Escape then closes the whole
 * editor, the very bug the pause exists to prevent. One owner, one token: any report
 * that arrives during the window makes the pending un-pause stand down.
 */
export function usePopoverTrapPause(): [paused: boolean, onTrapPausedChange: (next: boolean) => void] {
  const [paused, setPaused] = useState(false)
  // Bumped on every report, so a pending un-pause can tell something newer happened.
  const token = useRef(0)

  const onTrapPausedChange = useCallback((next: boolean) => {
    token.current += 1
    if (next) {
      setPaused(true)
      return
    }
    const mine = token.current
    void afterExit(EXIT_MS.popover).then(() => {
      if (token.current === mine) setPaused(false)
    })
  }, [])

  return [paused, onTrapPausedChange]
}
