import type { Transaction } from '../types'

/**
 * Both directions of the link between a reimbursement and what it paid back.
 *
 * Built once per dataset rather than scanned per row: the transaction editor
 * asks this on every open, and the list can hold thousands of rows.
 */
export interface ReimbursementLinks {
  /** The reimbursement that settled this transaction, if any. */
  settlementFor: (transactionId: number) => Transaction | undefined
  /** The transactions this reimbursement settled, oldest first. */
  settledBy: (reimbursementId: number) => Transaction[]
}

export function buildReimbursementLinks(transactions: Transaction[]): ReimbursementLinks {
  const byId = new Map<number, Transaction>()
  const covered = new Map<number, Transaction[]>()

  for (const txn of transactions) byId.set(txn.id, txn)
  for (const txn of transactions) {
    if (txn.settledBy == null) continue
    const bucket = covered.get(txn.settledBy)
    if (bucket) bucket.push(txn)
    else covered.set(txn.settledBy, [txn])
  }
  for (const rows of covered.values()) {
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
  }

  return {
    settlementFor: (transactionId) => {
      const txn = byId.get(transactionId)
      // A dangling id is dropped rather than thrown on: the reimbursement may
      // have been deleted in another tab before this dataset was refreshed.
      return txn?.settledBy != null ? byId.get(txn.settledBy) : undefined
    },
    settledBy: (reimbursementId) => covered.get(reimbursementId) ?? [],
  }
}
