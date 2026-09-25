import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExpenseSettings } from '../../types'
import { failureMessage } from './useFailureToast'

type Save = (patch: Partial<ExpenseSettings>) => void | Promise<void>

/**
 * The stepper side of the owner's assumed inflation, for every control that edits it: the
 * value shown is the one just clicked, and the save follows it.
 *
 * Steps in quick succession are not sent one by one. While a save is in flight only the newest
 * value is kept, and sent once it lands. A save that fails puts the saved value back and says
 * so, since a stepper still showing what was clicked reads as saved.
 */
export function useSavedInflation(value: number, onChange: Save) {
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  // True from the first step until the last one has landed. The saved value arriving in the
  // middle of that is an earlier step, and taking it would pull the stepper back to it for a
  // round trip before the newer one it is waiting on replaces it.
  const [busy, setBusy] = useState(false)
  // A value saved from elsewhere replaces the draft; tracked in render rather than in an
  // effect so the stepper never shows the old value for a frame.
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    if (!busy) setDraft(value)
  }

  // What the save handlers need without being recreated on every render.
  const saved = useRef(value)
  const send = useRef(onChange)
  useEffect(() => {
    saved.current = value
  }, [value])
  useEffect(() => {
    send.current = onChange
  }, [onChange])
  const inFlight = useRef(false)
  const queued = useRef<number | null>(null)

  // Sends `first`, then whatever was clicked while it was in flight, until nothing newer is left.
  const save = useCallback(async (first: number) => {
    inFlight.current = true
    setBusy(true)
    let next: number | null = first
    try {
      while (next !== null) {
        await send.current({ assumedInflation: next })
        saved.current = next
        setError(null)
        const newest: number | null = queued.current
        queued.current = null
        next = newest !== null && newest !== saved.current ? newest : null
      }
    } catch (e) {
      queued.current = null
      setDraft(saved.current)
      setError(failureMessage(e))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }, [])

  const step = useCallback(
    (next: number) => {
      if (!Number.isFinite(next)) return
      setDraft(next)
      setError(null)
      if (inFlight.current) queued.current = next
      else if (next !== saved.current) void save(next)
    },
    [save],
  )

  return { draft, error, step }
}
