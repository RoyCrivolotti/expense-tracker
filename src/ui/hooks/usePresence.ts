import { createContext, useContext } from 'react'

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
