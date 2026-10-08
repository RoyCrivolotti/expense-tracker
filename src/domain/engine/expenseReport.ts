import type { Flag, Transaction, TransactionAttachment } from '../types'
import { buildFlagGroup, settledFlagId } from './flagGroups'

export interface ReportLine {
  transaction: Transaction
  receipts: TransactionAttachment[]
  /**
   * 1-based position among the claim's receipts, for the `R1`, `R2` references
   * printed beside each line and under each image. A count told an approver how
   * many receipts a row had but not which ones, so nothing could be matched up.
   */
  receiptRefs: number[]
}

export interface ExpenseReport {
  flag: Flag
  /** What is being claimed: expense rows only. */
  lines: ReportLine[]
  /**
   * Refunds carrying the same flag — a reimbursement already received, or a
   * ticket handed back mid-trip. Either way they reduce what can be claimed, and
   * either way they are not part of what is being claimed.
   */
  credits: ReportLine[]
  /** Gross: the sum of `lines`, before anything already came back. */
  totalClaimedCents: number
  /** What the credits add up to, as a positive figure. */
  creditedCents: number
  /** Still owed: claimed minus credited. What the Flagged card shows. */
  outstandingCents: number
  /** Earliest and latest *claimed* date, for the header. */
  from: string
  to: string
  /**
   * Claimed lines with no receipt attached — what gets a claim sent back.
   * The lines themselves, not a count: the view lists them so each can be
   * opened, and deriving the same rule twice is how the two drift apart.
   */
  missingReceipts: ReportLine[]
}

/**
 * Assemble everything a claim needs, oldest first.
 *
 * Oldest first is deliberate and the one place this disagrees with the rest of
 * the app, which lists newest first: a claim is read as a chronological record
 * of a trip, and whoever approves it reads it top to bottom.
 *
 * **Refunds are split out of `lines` into `credits`.** They carry the same flag
 * — a reimbursement recorded against the claim, or a ticket handed back — and
 * leaving them among the claimed rows put a negative line in the document you
 * submit, stretched the header's date range to the day you were paid, inflated
 * the item count, and made every settled claim warn that one item had no
 * receipt. No discriminator between the two kinds is needed or possible: for a
 * claim document both reduce what can be claimed.
 *
 * Everything else is inherited from `buildFlagGroup` rather than re-derived, so
 * the report can never disagree with the Flagged card that launched it: cancelled
 * rows are out, non-spend types are out, and `outstandingCents` is the same
 * net-spend figure the card shows. Unlike the card, an archived flag still
 * builds — archiving is how a claim is marked done, and a done claim is exactly
 * the one an employer asks to see again.
 */
export function buildExpenseReport(
  flagId: number,
  transactions: Transaction[],
  flags: Flag[],
  attachments: TransactionAttachment[],
): ExpenseReport | null {
  const group = buildFlagGroup(flagId, transactions, flags)
  if (!group) return null
  return assembleReport(group.flag, group.transactions, attachments)
}

/**
 * The report as it was when a payment settled it.
 *
 * A past report needs nothing stored: the rows a payment covered still say so,
 * and the payment's own description is the name you gave it. Reassembling from
 * those two is why "send me the June one again" is answerable at all — the flag
 * itself has moved on to whatever you have spent since.
 */
export function buildSettledReport(
  reimbursementId: number,
  transactions: Transaction[],
  flags: Flag[],
  attachments: TransactionAttachment[],
): ExpenseReport | null {
  const covered = transactions.filter((t) => t.settledBy === reimbursementId)
  if (covered.length === 0) return null
  const flagId = settledFlagId(covered, flags)
  const flag =
    flags.find((f) => f.id === flagId) ??
    standInFlag(transactions.find((t) => t.id === reimbursementId))
  return assembleReport(flag, covered, attachments)
}

/**
 * A header for a past report whose flag is gone.
 *
 * This used to return null, which made the **Report** button in Past reports do
 * nothing at all — no overlay, no error, no explanation. The row stayed in the
 * list, because that list is built from `settledBy` and never needed the flag.
 *
 * It is reachable by more than one route, which is why the fix belongs here
 * rather than in any one of them: `deleteFlag` clears `flag_id` from *every*
 * row it owns, settled ones included, and a bulk edit that clears the flag on
 * the covered rows does the same thing.
 *
 * A past report's identity was never really the flag — it is the payment, which
 * still carries the name typed when it was recorded.
 */
export function standInFlag(payment: Transaction | undefined): Flag {
  return {
    id: payment?.id ?? 0,
    name: payment?.description || 'Reimbursement',
    color: '#6b7280',
    reimbursable: true,
    sortOrder: 0,
    // Archived, not active: this flag does not exist any more, and nothing
    // should offer it as somewhere to file new spending.
    active: false,
  }
}

function assembleReport(
  flag: Flag,
  rows: Transaction[],
  attachments: TransactionAttachment[],
): ExpenseReport | null {
  // Every remaining row is a credit (the expenses were cancelled or deleted
  // after settling). There is no report to print: the reference would render as
  // "WT-------", the period as a bare dash, and the total as a negative.
  if (!rows.some((t) => t.type !== 'refund')) return null

  const byTransaction = new Map<number, TransactionAttachment[]>()
  for (const attachment of attachments) {
    const bucket = byTransaction.get(attachment.transactionId)
    if (bucket) bucket.push(attachment)
    else byTransaction.set(attachment.transactionId, [attachment])
  }

  const chronological = [...rows].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id - b.id,
  )
  // Numbering runs across the claimed lines only, and in print order, so R3 on
  // a row is the third figure down the Receipts section.
  let nextRef = 0
  const toLine = (transaction: Transaction, numbered: boolean): ReportLine => {
    const receipts = byTransaction.get(transaction.id) ?? []
    return {
      transaction,
      receipts,
      receiptRefs: numbered ? receipts.map(() => (nextRef += 1)) : [],
    }
  }

  const lines = chronological.filter((t) => t.type !== 'refund').map((t) => toLine(t, true))
  const credits = chronological.filter((t) => t.type === 'refund').map((t) => toLine(t, false))
  const totalClaimedCents = lines.reduce((sum, line) => sum + line.transaction.amountCents, 0)
  const creditedCents = credits.reduce((sum, line) => sum + line.transaction.amountCents, 0)

  return {
    flag,
    lines,
    credits,
    totalClaimedCents,
    creditedCents,
    outstandingCents: totalClaimedCents - creditedCents,
    from: lines[0]?.transaction.date ?? '',
    to: lines[lines.length - 1]?.transaction.date ?? '',
    missingReceipts: lines.filter((line) => line.receipts.length === 0),
  }
}

/**
 * Every receipt in the claim, in line order, for the images section.
 *
 * Carries the same `R{n}` reference the table prints, so a figure can be tied
 * back to the row that claims it. Credits are excluded: they are not part of
 * what is being claimed, so they are not numbered.
 */
/** One numbered receipt, and the line that claims it. */
export interface ReceiptFigure {
  attachment: TransactionAttachment
  transaction: Transaction
  ref: number
}

export function reportReceipts(report: ExpenseReport): ReceiptFigure[] {
  return report.lines.flatMap((line) =>
    line.receipts.map((attachment, index) => ({
      attachment,
      transaction: line.transaction,
      ref: line.receiptRefs[index] ?? 0,
    })),
  )
}

/**
 * The same claim, keeping only the lines that have a receipt.
 *
 * For asking for reimbursement on just what can be proven, leaving the rest to
 * be covered out of pocket or claimed separately once a receipt turns up.
 * Credits stay: a reimbursement already received or a ticket handed back
 * reduces what can be claimed regardless of whether the original spend had a
 * receipt. Renumbers the R-references so the receipts section that follows
 * still reads 1, 2, 3 rather than skipping the lines left out.
 */
export function receiptsOnlyReport(report: ExpenseReport): ExpenseReport | null {
  const lines = report.lines.filter((line) => line.receipts.length > 0)
  if (lines.length === 0) return null

  let nextRef = 0
  const renumbered = lines.map((line) => ({
    ...line,
    receiptRefs: line.receipts.map(() => (nextRef += 1)),
  }))

  const totalClaimedCents = renumbered.reduce((sum, line) => sum + line.transaction.amountCents, 0)
  return {
    ...report,
    lines: renumbered,
    totalClaimedCents,
    outstandingCents: totalClaimedCents - report.creditedCents,
    from: renumbered[0]!.transaction.date,
    to: renumbered[renumbered.length - 1]!.transaction.date,
    missingReceipts: [],
  }
}
