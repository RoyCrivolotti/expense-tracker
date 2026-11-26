import type { MutableRefObject } from 'react'
import type { LeverKey } from '../../../engine'
import type { ExpenseSettings } from '../../../types'
import { failureMessage } from '../../hooks/useFailureToast'
import type { ToastApi } from '../../hooks/useToast'

export type Save = (patch: Partial<ExpenseSettings>) => Promise<void>

/** The session can no longer write (it went read-only) with a choice still waiting to be sent. */
class WriterGone extends Error {}

export const sameList = (
  a: readonly LeverKey[],
  b: readonly LeverKey[],
) => a.length === b.length && a.every((key, i) => key === b[i])

/** The refs and setters of the bar's hook that a save reads and writes. */
export interface LeverSaveState {
  inFlight: MutableRefObject<boolean>
  queued: MutableRefObject<readonly LeverKey[] | null>
  send: MutableRefObject<Save | undefined>
  savedRef: MutableRefObject<readonly LeverKey[]>
  current: MutableRefObject<readonly LeverKey[]>
  setBusy: (busy: boolean) => void
  setDraft: (keys: readonly LeverKey[]) => void
  showToast: ToastApi['showToast']
}

/**
 * Sends `first`, then whatever was chosen while it was in flight, until nothing newer is left. A save that fails puts
 * the saved list back and says so.
 */
export async function writeLevers(
  first: readonly LeverKey[],
  state: LeverSaveState,
) {
  const { inFlight, queued, send, savedRef, current, setBusy, setDraft, showToast } = state
  inFlight.current = true
  setBusy(true)
  let next: readonly LeverKey[] | null = first
  try {
    while (next !== null) {
      // A writer that is gone sent nothing: that is not a save, and must not be recorded as one.
      if (!send.current) throw new WriterGone()
      await send.current({ goalLevers: [...next] })
      savedRef.current = next
      const newest: readonly LeverKey[] | null = queued.current
      queued.current = null
      next = newest !== null && !sameList(newest, savedRef.current) ? newest : null
    }
  } catch (e) {
    queued.current = null
    current.current = savedRef.current
    setDraft(savedRef.current)
    showToast(
      e instanceof WriterGone
        ? "This session can no longer save changes, so the last choice wasn't saved."
        : failureMessage(e),
      'error',
    )
  } finally {
    inFlight.current = false
    setBusy(false)
  }
}
