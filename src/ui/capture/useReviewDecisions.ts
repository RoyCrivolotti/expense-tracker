import { useCallback, useState } from 'react'
import { UNDO_SHORTCUT } from '../components/toastShortcuts'
import { useToast } from '../hooks/useToast'
import { UNDO_MS, usePendingAction } from './usePendingAction'

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong')

/**
 * Holds one decision at a time for the undo window and keeps the payments it hides out of the list. A send that fails
 * puts its payment back with the reason. `done` is told once a payment has been decided on the server.
 */
export function useReviewDecisions(done: (id: string) => void) {
  const { showToast, dismissToast } = useToast()
  const pending = usePendingAction()
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const [failures, setFailures] = useState<ReadonlyMap<string, string>>(new Map())

  const hide = useCallback((id: string, on: boolean) => {
    setHidden((held) => {
      const next = new Set(held)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const decide = useCallback(
    (id: string, message: string, failure: string, send: () => Promise<unknown>) => {
      hide(id, true)
      setFailures((held) => new Map([...held].filter(([k]) => k !== id)))
      const toastKey = `review:${id}`
      pending.hold({
        undo: () => hide(id, false),
        commit: async () => {
          // Sent now, so its Undo is gone, however it came to be sent (the timer, a newer decision, the form).
          dismissToast?.(toastKey)
          try {
            await send()
            done(id)
          } catch (e) {
            setFailures((held) => new Map(held).set(id, messageOf(e)))
            // The row says why. A toast would replace the Undo of a newer decision that is still being held.
            if (!pending.isHeld()) showToast(`Couldn't ${failure}. It is back in the list.`, 'error')
          }
          hide(id, false)
        },
      })
      const action = { label: 'Undo', onAction: () => void pending.undo(), shortcut: UNDO_SHORTCUT }
      showToast(message, 'success', action, { holdMs: UNDO_MS, key: toastKey, keepOnTap: true })
    },
    [dismissToast, done, hide, pending, showToast],
  )

  return { hidden, failures, decide, flush: pending.flush }
}
