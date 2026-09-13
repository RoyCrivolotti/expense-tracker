import type { Flag, Transaction, TransactionAttachment } from '../types'
import { buildFlagGroup } from './flagGroups'

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
  // Every remaining row is a credit (the expenses were cancelled or deleted
  // after settling). There is no claim to print: the reference would render as
  // "WT-------", the period as a bare dash, and the total as a negative.
  if (!group.transactions.some((t) => t.type !== 'refund')) return null

  const byTransaction = new Map<number, TransactionAttachment[]>()
  for (const attachment of attachments) {
    const bucket = byTransaction.get(attachment.transactionId)
    if (bucket) bucket.push(attachment)
    else byTransaction.set(attachment.transactionId, [attachment])
  }

  const chronological = [...group.transactions].sort(
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
    flag: group.flag,
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
 * A short reference for the claim, stable across reprints.
 *
 * Derived from the flag and the first claimed month rather than the issue date,
 * so reprinting an unchanged claim gives the same reference — otherwise it could
 * not be quoted in an email. It is the claimant's own handle on the claim; an
 * employer will assign their own.
 *
 * Not immutable: adding a receipt dated earlier than the current first line
 * moves the period, and with it the reference. Anchoring on something that
 * cannot move would mean storing it, which this deliberately does not do.
 */
export function reportReference(report: ExpenseReport): string {
  const initials = report.flag.name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => [...word][0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 3)
  const period = report.from ? report.from.slice(0, 7).replace('-', '') : '------'
  return `${initials || 'CLM'}-${period}`
}

/**
 * Every receipt in the claim, in line order, for the images section.
 *
 * Carries the same `R{n}` reference the table prints, so a figure can be tied
 * back to the row that claims it. Credits are excluded: they are not part of
 * what is being claimed, so they are not numbered.
 */
export function reportReceipts(report: ExpenseReport): {
  attachment: TransactionAttachment
  transaction: Transaction
  ref: number
}[] {
  return report.lines.flatMap((line) =>
    line.receipts.map((attachment, index) => ({
      attachment,
      transaction: line.transaction,
      ref: line.receiptRefs[index] ?? 0,
    })),
  )
}
