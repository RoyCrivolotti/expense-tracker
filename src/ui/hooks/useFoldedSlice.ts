import { useEffect, useState } from 'react'
import { EXIT_MS, motionEnabled } from './motion'
import { useHeldWhen } from './usePresence'
import { NO_ROWS, type RowSlice } from './windowLayout'

/**
 * The rows a day group should have in the DOM. A folded group needs none, but one that has just
 * been folded keeps what it had until the fold has played, or the rows would vanish at once and
 * there would be nothing left to fold. A group that starts folded has no fold to play.
 */
export function useFoldedSlice(slice: RowSlice, collapsed: boolean): RowSlice {
  const held = useHeldWhen(slice, collapsed)
  const [folded, setFolded] = useState(collapsed)
  // Adjusting state while rendering, as Presence does: unfolding shows the rows in the same
  // commit that starts the unfold, so there is something to grow.
  if (!collapsed && folded) setFolded(false)

  useEffect(() => {
    if (!collapsed) return
    const timer = setTimeout(() => setFolded(true), motionEnabled() ? EXIT_MS.fold : 0)
    return () => clearTimeout(timer)
  }, [collapsed])

  if (!collapsed) return slice
  return folded ? NO_ROWS : held
}
