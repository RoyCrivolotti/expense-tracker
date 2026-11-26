import type { Dispatch, SetStateAction } from 'react'
import type { ExpenseActions } from '../actions'
import { todayLocalIso } from '../dates'
import { failureMessage } from '../hooks/useFailureToast'
import type { ToastApi } from '../hooks/useToast'
import type { StatementRow } from './cardStatementRows'

/** The paid-state saves of a month's card statements, or undefined when the session cannot write. */
export function makeStatementSaves(
  actions: ExpenseActions | undefined,
  month: string,
  setPending: Dispatch<SetStateAction<ReadonlySet<number>>>,
  showToast: ToastApi['showToast'],
) {
  // A save is tracked per card: one card's save finishing must not unlock another's.
  const track = (
    accountId: number,
    saving: boolean,
  ) =>
    setPending((prev) => {
      const next = new Set(prev)
      if (saving) next.add(accountId)
      else next.delete(accountId)
      return next
    })

  const save = actions?.setStatementPaid
    ? async (
        accountId: number,
        paid: boolean,
        paidOn?: string,
      ) => {
        track(accountId, true)
        try {
          await actions.setStatementPaid(accountId, month, paid, paid ? (paidOn ?? todayLocalIso()) : undefined)
        } finally {
          track(accountId, false)
        }
      }
    : undefined

  // One tap, dated today. Another day is picked in the sheet the row opens.
  const markPaidToday = save
    ? async (row: StatementRow) => {
        try {
          await save(row.id, true)
          showToast(`${row.name} marked paid today`, 'success')
        } catch (e) {
          showToast(failureMessage(e), 'error')
        }
      }
    : undefined
  return { save, markPaidToday }
}
