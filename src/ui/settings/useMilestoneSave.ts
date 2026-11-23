import { useEffect, useRef, useState } from 'react'
import type { ExpenseSettings, Milestone } from '../../types'

/**
 * The working list of milestones and the saves that send it. Every save sends the whole list, so the edits
 * are kept in order and a failed one is rolled back only when nothing later was built on it.
 */
export function useMilestoneSave(
  milestones: Milestone[],
  onChange: (patch: Partial<ExpenseSettings>) => void | Promise<void>,
) {
  // Each save sends the whole list, so building one from the last render would
  // let a second edit overwrite a first that is still in flight. This holds the
  // working list and updates synchronously, ahead of the server round-trip.
  const workingRef = useRef(milestones)
  const inFlight = useRef(0)
  const latestSave = useRef(0)
  // A save that fails would otherwise fail in silence: the input keeps the edit while
  // the server never got it.
  const [error, setError] = useState<string | null>(null)
  const [failed, setFailed] = useState<{ amountCents: number; n: number } | null>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    // On a phone the list runs under the fold; an alert nobody sees is no alert.
    if (error) errorRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [error])

  useEffect(() => {
    if (inFlight.current === 0) workingRef.current = milestones
  }, [milestones])

  const save = async (
    next: Milestone[],
    origin: number | null = null,
  ) => {
    const previous = workingRef.current
    workingRef.current = next
    inFlight.current += 1
    const seq = ++latestSave.current
    setError(null)
    try {
      await onChange({ milestones: next })
    } catch (e) {
      // A later save was built on this list and carried this edit with it; if that one
      // landed, rolling back here would discard what the server already holds.
      if (seq === latestSave.current) {
        workingRef.current = previous
        setError(e instanceof Error ? e.message : 'Could not save the milestones')
        if (origin !== null) setFailed((f) => ({ amountCents: origin, n: (f?.n ?? 0) + 1 }))
      }
    } finally {
      inFlight.current -= 1
    }
  }

  // Addressed by amount rather than index: the working list can already differ
  // from the rendered one while a save is in flight. A row addresses itself by the
  // amount it last committed; after a failed save that amount is gone from the working
  // list again, so the row falls back to its saved one and the retry carries the edit.
  const replaceAmount = (
    key: number,
    savedAmountCents: number,
    next: Milestone,
  ) => {
    const known = workingRef.current.some((m) => m.amountCents === key) ? key : savedAmountCents
    void save(
      workingRef.current.map((m) => (m.amountCents === known ? next : m)),
      savedAmountCents,
    )
  }
  const removeAmount = (amountCents: number) =>
    void save(workingRef.current.filter((m) => m.amountCents !== amountCents))

  return { workingRef, error, errorRef, failed, save, replaceAmount, removeAmount }
}
