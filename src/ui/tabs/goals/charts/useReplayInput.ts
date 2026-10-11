import { useHeldValue } from '../../../hooks/useHeldValue'
import { useQuietValue } from '../../../hooks/useQuietValue'

/** How long the edits must stop before a 10.000-run replay is redone. */
export const REPLAY_QUIET_MS = 250

/**
 * What a replay should read of the plan being edited: the edits once they have stopped for a moment,
 * so dragging a control is not held up by it, and the last ones read while `paused` (the card is far
 * from the screen). Undefined if the card has not been near the screen yet.
 */
export function useReplayInput<T>(live: T, paused: boolean): T | undefined {
  return useHeldValue(useQuietValue(live, REPLAY_QUIET_MS), !paused)
}

/** The same, for a card that always has something to read: the live value until there is a settled one. */
export function useReplayInputOrLive<T>(live: T, paused: boolean): T {
  return useReplayInput(live, paused) ?? live
}
