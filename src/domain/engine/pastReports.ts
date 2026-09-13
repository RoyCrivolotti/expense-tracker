import type { Flag, Transaction } from '../types'

/**
 * A reimbursement you have already recorded, and what it covered.
 *
 * Nothing extra is stored to produce this. A past expense report *is* a
 * payment: the rows it settled still point at it, and its own description is
 * the name you typed — "Alicante expenses, September 2026", if you named it
 * that. Everything here is read back off those two facts.
 */
export interface PastReport {
  payment: Transaction
  flag: Flag | undefined
  /** How many transactions the payment covered. */
  count: number
  /** What those transactions came to, which need not equal what was paid. */
  coveredCents: number
}

/** Newest first, like the rest of the app. */
export function listPastReports(transactions: Transaction[], flags: Flag[]): PastReport[] {
  const covered = new Map<number, Transaction[]>()
  for (const txn of transactions) {
    if (txn.settledBy == null) continue
    const bucket = covered.get(txn.settledBy)
    if (bucket) bucket.push(txn)
    else covered.set(txn.settledBy, [txn])
  }

  const byId = new Map(transactions.map((t) => [t.id, t]))
  const reports: PastReport[] = []
  for (const [paymentId, rows] of covered) {
    const payment = byId.get(paymentId)
    // A payment deleted in another tab before this dataset refreshed. Skipped
    // rather than thrown on — the rows return to the card on the next load.
    if (!payment) continue
    const flagId = rows.find((t) => t.flagId != null)?.flagId
    reports.push({
      payment,
      flag: flags.find((f) => f.id === flagId),
      count: rows.length,
      coveredCents: rows.reduce(
        (sum, t) => sum + (t.type === 'refund' ? -t.amountCents : t.amountCents),
        0,
      ),
    })
  }
  return reports.sort(
    (a, b) =>
      b.payment.date.localeCompare(a.payment.date) || b.payment.id - a.payment.id,
  )
}
