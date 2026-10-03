import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Presence } from '../components/Presence'
import { EXIT_MS } from '../hooks/motion'
import { LeaveGuardContext, type UnsavedWork } from './leaveGuardContext'
import { LeaveSheet } from './LeaveSheet'

/** A save on its way is not asked about: it finishes whether or not the section is still there. */
const holdsEdits = (work: UnsavedWork | null): work is UnsavedWork => work !== null && !work.saving

/**
 * Holds what the current section says it would lose by being left, asks before the shell moves
 * off it, and has the browser ask before the page itself goes (reload, close, Back, or a link to
 * another app, none of which the shell sees).
 *
 * The question keeps the move that raised it, so Leave goes where the user was headed. A second
 * move asked for while the question is up replaces the first: the last click is the one meant.
 */
export function LeaveGuardProvider({ children }: { children: ReactNode }) {
  const [work, setWorkState] = useState<UnsavedWork | null>(null)
  // Read by `guardLeave` at the moment of a click, which a state read in a stale closure could miss.
  const workRef = useRef<UnsavedWork | null>(null)
  const goRef = useRef<(() => void) | null>(null)
  // Held apart from `open`, so the sheet keeps its text while it animates out.
  const [asked, setAsked] = useState<UnsavedWork | null>(null)
  const [open, setOpen] = useState(false)

  const guardLeave = useCallback((go: () => void) => {
    const current = workRef.current
    if (!holdsEdits(current)) {
      go()
      return
    }
    goRef.current = go
    setAsked(current)
    setOpen(true)
  }, [])

  const stay = useCallback(() => {
    goRef.current = null
    setOpen(false)
  }, [])

  // Taken out of the ref first: a second press while the sheet leaves cannot move twice.
  const leave = useCallback(() => {
    const go = goRef.current
    goRef.current = null
    setOpen(false)
    go?.()
  }, [])

  const setWork = useCallback(
    (next: UnsavedWork | null) => {
      workRef.current = next
      setWorkState(next)
      // The edits went (saved, or put back by a refresh) with the question still up: nothing is
      // left to lose, so the move the user asked for happens instead of a warning that is not true.
      if (goRef.current && !holdsEdits(next)) leave()
    },
    [leave],
  )

  const unsaved = work !== null
  useEffect(() => {
    if (!unsaved) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Older engines show the browser's prompt only when this is set.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  const api = useMemo(() => ({ setWork, guardLeave }), [setWork, guardLeave])
  return (
    <LeaveGuardContext.Provider value={api}>
      {children}
      <Presence show={open} exitMs={EXIT_MS.sheet}>
        {asked ? <LeaveSheet work={asked} onLeave={leave} onStay={stay} /> : null}
      </Presence>
    </LeaveGuardContext.Provider>
  )
}
