import type { Flag, Transaction } from '../types'

/**
 * A reimbursement you have already recorded, and what it covered.
 *
 * A past expense report *is* a payment: the rows it settled still point at it, and
 * its own description is the name you typed — "Alicante expenses, September 2026",
 * if you named it that. The list of lines is read back off those two facts.
 *
 * The totals are not. Rebuilding them from the live rows means editing or deleting
 * one afterwards rewrites the record of what was submitted, so the settle stamps the
 * payment with the figures at the time (migration 0021) and those are what is shown.
 */
export interface PastReport {
  payment: Transaction
  flag: Flag | undefined
  /** How many transactions the payment covered when it was recorded. */
  count: number
  /** What those came to, which need not equal what was paid. */
  coveredCents: number
  /**
   * The covered rows have changed since the payment was recorded.
   *
   * Amount edits, deletions and un-settles all move one of the two stamped figures.
   * A pure description edit does not: the check is over totals, not line contents.
   *
   * Also false for a payment recorded before 0021, which carries no stamp to compare
   * against. The two cases are deliberately not distinguished in the UI, because
   * nothing ever claims a report *does* match; only a positive mismatch is stated, so
   * silence asserts nothing either way.
   */
  drifted: boolean
  /**
   * How many covered rows are still in the dataset. Zero when every one has been
   * deleted or un-settled since, which is the only case where nothing can be
   * rebuilt: the recorded figures survive, the document does not.
   */
  remaining: number
}

/** Covered-row totals as recorded, and whether the live rows still match them. */
function againstSnapshot(
  payment: Transaction,
  rows: Transaction[],
): Pick<PastReport, 'count' | 'coveredCents' | 'drifted' | 'remaining'> {
  const liveCount = rows.length
  const liveCents = rows.reduce(
    (sum, t) => sum + (t.type === 'refund' ? -t.amountCents : t.amountCents),
    0,
  )
  const checkable = payment.reportCount != null && payment.reportCoveredCents != null
  return {
    count: payment.reportCount ?? liveCount,
    coveredCents: payment.reportCoveredCents ?? liveCents,
    drifted:
      checkable && (payment.reportCount !== liveCount || payment.reportCoveredCents !== liveCents),
    remaining: liveCount,
  }
}

/**
 * Whether a reopened report still shows what was submitted.
 *
 * False for a payment with no snapshot as well as one that matches: "we cannot
 * tell" is not something to warn about, and the reprint is the best available
 * either way.
 */
export function pastReportDrifted(paymentId: number, transactions: Transaction[]): boolean {
  const payment = transactions.find((t) => t.id === paymentId)
  if (!payment) return false
  return againstSnapshot(
    payment,
    transactions.filter((t) => t.settledBy === paymentId),
  ).drifted
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

  // A payment whose covered rows have *all* gone would otherwise never become a key
  // above, so the report it recorded would vanish from this list entirely. That is the
  // most complete form of the very thing the snapshot exists to prevent, so a stamped
  // payment is indexed whether or not anything still points at it.
  for (const txn of transactions) {
    if ((txn.reportCount ?? 0) > 0 && !covered.has(txn.id)) covered.set(txn.id, [])
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
      ...againstSnapshot(payment, rows),
    })
  }
  return reports.sort(
    (a, b) =>
      b.payment.date.localeCompare(a.payment.date) || b.payment.id - a.payment.id,
  )
}
