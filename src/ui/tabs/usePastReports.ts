import { useState } from 'react'
import type { Transaction } from '../../types'

export interface PastReportsState {
  /** Whether the list of past reports is open. */
  listing: boolean
  /** The payment whose report is being reopened, or null. */
  paymentId: number | null
  /**
   * Opens the list, or undefined until at least one reimbursement exists — so
   * the entry point hides itself rather than the caller branching on a count.
   */
  entry: (() => void) | undefined
  closeList: () => void
  openReport: (paymentId: number) => void
  closeReport: () => void
}

/**
 * The past-reports list and the report it can reopen.
 *
 * Its own hook because the Transactions tab is already at the complexity
 * ceiling, and these four pieces of state are independent of everything else
 * on that screen.
 */
export function usePastReports(transactions: Transaction[]): PastReportsState {
  const [listing, setListing] = useState(false)
  const [paymentId, setPaymentId] = useState<number | null>(null)

  return {
    listing,
    paymentId,
    // A stamped payment counts even with nothing still pointing at it: its covered rows
    // may all have been deleted since, and that report is precisely the one worth reaching.
    entry: transactions.some((t) => t.settledBy != null || (t.reportCount ?? 0) > 0)
      ? () => setListing(true)
      : undefined,
    closeList: () => setListing(false),
    openReport: (id) => {
      // Closing the list first: the report is a full-screen page, and the modal
      // underneath would keep its focus trap live beneath it.
      setListing(false)
      setPaymentId(id)
    },
    closeReport: () => setPaymentId(null),
  }
}
