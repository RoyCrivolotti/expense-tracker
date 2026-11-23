import { useEffect, useState } from 'react'
import type { ExpenseModel } from './useExpenseData'
import { HISTORY_WORDS } from './historyWords'

/** Tells a model that reads `history` from the server that this screen uses it, for as long as the screen is mounted. */
export function useHistoryWatch(
  { watchHistory }: ExpenseModel,
  active = true,
): void {
  useEffect(() => (active ? watchHistory?.() : undefined), [watchHistory, active])
}

/**
 * True while a model that holds only some of the rows has no `history` yet. The monthly series need every row they
 * are made of, so a screen that reads them offers nothing until the history arrives, rather than series built from
 * the months that happen to be loaded.
 */
export function historyPending({ sums, history }: ExpenseModel): boolean {
  return sums !== undefined && history === undefined
}

/** How long a screen holds something back for the history before it shows without it. */
export const HISTORY_WAIT_MS = 3000

/** Set once a wait for the history has run to the cap; kept for the session, so a hung read is waited for once. */
let gaveUp = false

/**
 * True while a screen that has something to show should still wait for the history: the model holds only some rows,
 * has no `history` yet, the read is on its way (not failed, not offline) and `HISTORY_WAIT_MS` have not passed. A read
 * the model already says failed ends the wait at once, and one that hangs is waited for once: the give-up outlives the
 * screen and is forgotten when the history lands.
 */
export function useWaitingForHistory(
  model: ExpenseModel,
  active: boolean,
): boolean {
  const pending = historyPending(model)
  const [, rerender] = useState(0)
  const { historyNote } = model
  const known = historyNote === undefined || historyNote === HISTORY_WORDS.loading
  const waiting = active && pending && known && !gaveUp
  useEffect(() => {
    if (!pending) gaveUp = false
  }, [pending])
  useEffect(() => {
    if (!waiting) return
    const timer = setTimeout(() => {
      gaveUp = true
      rerender((n) => n + 1)
    }, HISTORY_WAIT_MS)
    return () => clearTimeout(timer)
  }, [waiting])
  return waiting
}
