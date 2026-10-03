import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_LEVERS, MAX_LEVERS, type LeverKey } from '../../../engine'
import type { ExpenseSettings } from '../../../types'
import { failureMessage } from '../../hooks/useFailureToast'
import { useToast } from '../../hooks/useToast'

type Save = (patch: Partial<ExpenseSettings>) => Promise<void>

/** What the Goals page's bar holds, and what can be done to it. */
export interface StarredLevers {
  /** The inputs in the bar, in the order they are shown: the one just chosen, not yet the saved one. */
  keys: readonly LeverKey[]
  /** Whether the inputs can be changed: not in a read-only session. */
  canEdit: boolean
  /** Whether another can be added: there is room, and the session can write. */
  canAdd: boolean
  isDefault: boolean
  /** Takes an input out of the bar if it is in it, and puts it in at the end if it is not and there is room. */
  toggle: (key: LeverKey) => void
  /** Puts back the five the bar has until someone chooses. */
  reset: () => void
}

const sameList = (a: readonly LeverKey[], b: readonly LeverKey[]) => a.length === b.length && a.every((key, i) => key === b[i])

/**
 * The inputs the owner keeps in the Goals page's bar, for every control that changes them: the
 * list shown is the one just chosen, and the save follows it.
 *
 * Choices in quick succession are not sent one by one. While a save is in flight only the newest
 * list is kept, and sent once it lands. A save that fails puts the saved list back and says so,
 * since a bar still showing what was clicked reads as saved. Without `save` (a read-only session)
 * nothing can be chosen.
 */
export function useStarredLevers(saved: readonly LeverKey[], save: Save | undefined): StarredLevers {
  const { showToast } = useToast()
  const [draft, setDraft] = useState<readonly LeverKey[]>(saved)
  // True from the first choice until the last has landed: the saved list arriving in the middle
  // of that is an earlier choice, and taking it would show the bar going back for a round trip.
  const [busy, setBusy] = useState(false)
  // A list saved from elsewhere (another device) replaces the draft; tracked in render rather than
  // in an effect so the bar never shows the old one for a frame.
  const [seen, setSeen] = useState(saved)
  if (!sameList(seen, saved)) {
    setSeen(saved)
    if (!busy) setDraft(saved)
  }

  // What the handlers need without being recreated on every render.
  const current = useRef(draft)
  const savedRef = useRef(saved)
  const send = useRef(save)
  useEffect(() => {
    current.current = draft
  }, [draft])
  useEffect(() => {
    savedRef.current = saved
  }, [saved])
  useEffect(() => {
    send.current = save
  }, [save])
  const inFlight = useRef(false)
  const queued = useRef<readonly LeverKey[] | null>(null)

  // Sends `first`, then whatever was chosen while it was in flight, until nothing newer is left.
  const write = useCallback(
    async (first: readonly LeverKey[]) => {
      inFlight.current = true
      setBusy(true)
      let next: readonly LeverKey[] | null = first
      try {
        while (next !== null) {
          await send.current?.({ goalLevers: [...next] })
          savedRef.current = next
          const newest: readonly LeverKey[] | null = queued.current
          queued.current = null
          next = newest !== null && !sameList(newest, savedRef.current) ? newest : null
        }
      } catch (e) {
        queued.current = null
        current.current = savedRef.current
        setDraft(savedRef.current)
        showToast(failureMessage(e), 'error')
      } finally {
        inFlight.current = false
        setBusy(false)
      }
    },
    [showToast],
  )

  const choose = useCallback(
    (next: readonly LeverKey[]) => {
      current.current = next
      setDraft(next)
      if (inFlight.current) queued.current = next
      else if (!sameList(next, savedRef.current)) void write(next)
    },
    [write],
  )

  const canEdit = save !== undefined
  const toggle = useCallback(
    (key: LeverKey) => {
      if (!send.current) return
      const now = current.current
      if (now.includes(key)) choose(now.filter((k) => k !== key))
      else if (now.length < MAX_LEVERS) choose([...now, key])
    },
    [choose],
  )
  const reset = useCallback(() => {
    if (send.current) choose([...DEFAULT_LEVERS])
  }, [choose])

  return {
    keys: draft,
    canEdit,
    canAdd: canEdit && draft.length < MAX_LEVERS,
    isDefault: sameList(draft, DEFAULT_LEVERS),
    toggle,
    reset,
  }
}
