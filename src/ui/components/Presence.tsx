import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { motionEnabled } from '../hooks/motion'
import { PresenceContext, useExit } from '../hooks/usePresence'

type Phase = 'open' | 'closing' | 'closed'

interface PresenceProps {
  show: boolean
  exitMs: number
  children: ReactNode
}

/**
 * Where an overlay is in its life: shown, playing its exit, or gone. `session` changes
 * each time it is shown again, so a reopened overlay is a new instance.
 */
function usePhase(show: boolean, exitMs: number): { mounted: boolean; exiting: boolean; session: number } {
  const [phase, setPhase] = useState<Phase>(show ? 'open' : 'closed')
  const [session, setSession] = useState(0)

  // Adjusting state while rendering is the documented way to follow a prop without an
  // extra commit; both branches are guarded, so neither can loop.
  if (show && phase !== 'open') {
    setPhase('open')
    setSession(session + 1)
  } else if (!show && phase === 'open') {
    setPhase(motionEnabled() ? 'closing' : 'closed')
  }

  useEffect(() => {
    if (phase !== 'closing') return
    const timer = setTimeout(() => setPhase('closed'), exitMs)
    return () => clearTimeout(timer)
  }, [phase, exitMs])

  const exiting = phase === 'closing' && !show
  return { mounted: show || phase === 'closing', exiting, session }
}

/**
 * Keeps an overlay mounted for `exitMs` after `show` turns false, so it can animate out.
 *
 * An element removed in the same commit that closes it cannot animate out. Holding it a
 * moment longer lets every route out of an overlay (Save, Discard, a swipe, a programmatic
 * close) play the same exit, and the action that closed it runs at once rather than after
 * the animation.
 *
 * An overlay inside another one leaves with it. Nothing else could tell a confirm sheet
 * that the modal under it has just been discarded, and it would sit there until the
 * modal unmounted it mid-air.
 *
 * Reopening while an exit is still playing mounts a fresh instance instead of reviving
 * the old one, so a form never inherits the last person's half-typed fields.
 */
export function Presence({ show, exitMs, children }: PresenceProps) {
  const parent = useExit()
  const { mounted, exiting, session } = usePhase(show, exitMs)
  const leaving = exiting || parent.leaving
  const value = useMemo(() => ({ closing: leaving, exitMs }), [leaving, exitMs])

  if (!mounted) return null
  return (
    <PresenceContext.Provider value={value}>
      <Fragment key={session}>{children}</Fragment>
    </PresenceContext.Provider>
  )
}

interface PresenceValueProps<T> {
  value: T | null | undefined
  exitMs: number
  children: (value: T) => ReactNode
}

/**
 * `Presence` for an overlay whose props come from state that is null while closed.
 *
 * The last non-null value is held for the exit, so the overlay can keep rendering what
 * it was showing while it leaves, and every other prop is read fresh from the caller.
 */
export function PresenceValue<T>({ value, exitMs, children }: PresenceValueProps<T>) {
  // In a tuple because `useState` calls a function it is handed, as an initialiser or an
  // updater, and a held callback (the add button's handler) must be kept, not run.
  const [held, setHeld] = useState<[T | null | undefined]>([value])
  if (value != null && held[0] !== value) setHeld([value])
  const shown = value ?? held[0]
  return (
    <Presence show={value != null} exitMs={exitMs}>
      {shown != null ? children(shown) : null}
    </Presence>
  )
}
