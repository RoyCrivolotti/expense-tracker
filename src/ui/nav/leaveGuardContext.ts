import { createContext, useContext, useEffect } from 'react'

/**
 * Edits a section holds that leaving it would drop. A section that has some says so with
 * `useUnsavedWork`, and the shell asks before it changes section.
 */
export interface UnsavedWork {
  /** What the edits are to: the scenario they were made on, else the draft. */
  name: string
  /** No saved scenario holds them, so saving means saving as a new one. */
  detached: boolean
  /** There is a Save to press; a read-only session has none. */
  canSave: boolean
  /** A save is already on its way. */
  saving: boolean
}

interface LeaveGuardApi {
  setWork: (work: UnsavedWork | null) => void
  guardLeave: (go: () => void) => void
}

/** Without a provider (a section on its own in a test) nothing is held and every leave goes. */
export const LeaveGuardContext = createContext<LeaveGuardApi>({
  setWork: () => {},
  guardLeave: (go) => go(),
})

/**
 * Tells the shell whether this section holds unsaved edits, for as long as it is mounted. Pass
 * null when there are none. Memoise `work`: a new object each render is a new registration.
 */
export function useUnsavedWork(work: UnsavedWork | null): void {
  const { setWork } = useContext(LeaveGuardContext)
  useEffect(() => {
    setWork(work)
  }, [setWork, work])
  // A section that goes away takes its edits with it, and must not leave a question behind.
  useEffect(() => () => setWork(null), [setWork])
}

/**
 * Wraps a move out of the current section: `go` runs now if nothing is unsaved, else once the
 * user has said to leave. Every route out of a section in the app's own UI goes through this;
 * the browser's own ways out (reload, close, Back, a link to another app) are the shell's
 * `beforeunload` prompt.
 */
export function useGuardLeave(): (go: () => void) => void {
  return useContext(LeaveGuardContext).guardLeave
}
