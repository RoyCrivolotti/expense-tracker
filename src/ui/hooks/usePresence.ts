import { createContext, useContext, useState } from 'react'

export interface PresenceState {
  /** The owner has let go, or an overlay this one sits inside has; it is playing its exit. */
  closing: boolean
  exitMs: number
}

export const PresenceContext = createContext<PresenceState | null>(null)

/**
 * Where an overlay learns that it is leaving.
 *
 * Null when nothing is animating its exit, and the overlay then closes at once, as
 * every overlay here did before.
 */
export function usePresence(): PresenceState | null {
  return useContext(PresenceContext)
}

/** `usePresence` for an overlay that only wants to know whether it is leaving, and for how long. */
export function useExit(): { leaving: boolean; exitMs: number } {
  const presence = useContext(PresenceContext)
  return { leaving: presence?.closing ?? false, exitMs: presence?.exitMs ?? 0 }
}

/**
 * `value` as it stood until this overlay began to leave, and that from then on.
 *
 * An exit plays for a moment after whatever closed the overlay has done its work, and that
 * work can change what the overlay reads: a delete that removes the record a sheet is about,
 * a save that renames the thing being edited. Reading the new value mid-exit swaps a sheet's
 * wording, or drops a sheet that was meant to leave with its editor, while it is on screen.
 */
export function useHeldWhileLeaving<T>(value: T): T {
  const { leaving } = useExit()
  // In a tuple, for the reason `PresenceValue` keeps one: `useState` runs a function it is given.
  const [held, setHeld] = useState<[T]>([value])
  if (!leaving && !Object.is(held[0], value)) setHeld([value])
  return leaving ? held[0] : value
}
