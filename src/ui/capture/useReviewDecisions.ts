import { useCallback, useState } from 'react'
import { useToast } from '../hooks/useToast'
import { UNDO_MS, usePendingAction } from './usePendingAction'

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong')

/**
 * Holds one decision at a time for the undo window and keeps the payments it hides out of the list. A send that fails
 * puts its payment back with the reason. `done` is told once a payment has been decided on the server.
 */
export function useReviewDecisions(done: (id: string) => void) {
  const { showToast } = useToast()
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
      pending.hold({
        undo: () => hide(id, false),
        commit: async () => {
          try {
            await send()
            done(id)
          } catch (e) {
            setFailures((held) => new Map(held).set(id, messageOf(e)))
            showToast(`Couldn't ${failure}. It is back in the list.`, 'error')
          }
          hide(id, false)
        },
      })
      showToast(message, 'success', { label: 'Undo', onAction: () => void pending.undo() }, UNDO_MS)
    },
    [done, hide, pending, showToast],
  )

  return { hidden, failures, decide, flush: pending.flush }
}
