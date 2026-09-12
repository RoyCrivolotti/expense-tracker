import { useState } from 'react'
import type { ExpenseActions } from '../actions'
import type { FlagGroup } from '../../domain/engine/flagGroups'
import type { NewTransaction } from '../../data/dataSource'
import { recordReimbursement } from './settleClaim'

export interface ClaimSettlement {
  /** The claim being settled, or null when the sheet is closed. */
  group: FlagGroup | null
  busy: boolean
  /** Set when the last attempt failed; the payment was rolled back. */
  error: string | null
  open: (group: FlagGroup) => void
  cancel: () => void
  record: (input: Omit<NewTransaction, 'type' | 'cancelled'>, transactionIds: number[]) => void
}

/**
 * The settle-a-claim sheet's state, out of the Transactions tab.
 *
 * Extracted so the failure path is testable: the tab is a heavy component and
 * this was eighteen lines of orchestration inside its JSX, where the only way
 * to exercise the rollback message was to mount the whole screen.
 */
export function useClaimSettlement(actions: ExpenseActions | undefined): ClaimSettlement {
  const [group, setGroup] = useState<FlagGroup | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cancel = () => {
    setGroup(null)
    setError(null)
  }

  const record: ClaimSettlement['record'] = (input, transactionIds) => {
    if (!actions) return
    setBusy(true)
    setError(null)
    void recordReimbursement(actions, { ...input, type: 'refund', cancelled: false }, transactionIds)
      .then(() => setGroup(null))
      .catch((e: unknown) => {
        // The payment is rolled back on failure, so nothing was recorded —
        // saying so beats a sheet that simply sits there.
        const why = e instanceof Error ? e.message : 'Could not record the reimbursement'
        setError(`${why}. Nothing was recorded — try again.`)
      })
      .finally(() => setBusy(false))
  }

  return { group, busy, error, open: setGroup, cancel, record }
}
