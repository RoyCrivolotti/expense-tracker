import type { Flag, Transaction, TransactionAttachment } from '../types'
import { groupTransactionsByFlag } from './flagGroups'

export interface PackLine {
  transaction: Transaction
  receipts: TransactionAttachment[]
}

export interface ReimbursementPack {
  flag: Flag
  lines: PackLine[]
  totalCents: number
  /** Earliest and latest transaction date in the claim, for the header. */
  from: string
  to: string
  /** Lines with no receipt attached — the thing that gets a claim sent back. */
  missingReceipts: number
}

/**
 * Assemble everything a claim needs, oldest first.
 *
 * Oldest first is deliberate and the one place this disagrees with the rest of
 * the app, which lists newest first: a claim is read as a chronological record
 * of a trip, and whoever approves it reads it top to bottom.
 *
 * Scope and exclusions are inherited from `groupTransactionsByFlag` rather than
 * re-derived, so the pack can never disagree with the Flagged card that launched
 * it — cancelled rows are out, an archived flag produces nothing, and the total
 * is the same net-spend figure shown on the card.
 */
export function buildReimbursementPack(
  flagId: number,
  transactions: Transaction[],
  flags: Flag[],
  attachments: TransactionAttachment[],
): ReimbursementPack | null {
  const group = groupTransactionsByFlag(transactions, flags).find((g) => g.flag.id === flagId)
  if (!group) return null

  const byTransaction = new Map<number, TransactionAttachment[]>()
  for (const attachment of attachments) {
    const bucket = byTransaction.get(attachment.transactionId)
    if (bucket) bucket.push(attachment)
    else byTransaction.set(attachment.transactionId, [attachment])
  }

  const ordered = [...group.transactions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id - b.id,
  )
  const lines = ordered.map((transaction) => ({
    transaction,
    receipts: byTransaction.get(transaction.id) ?? [],
  }))

  return {
    flag: group.flag,
    lines,
    totalCents: group.totalCents,
    from: ordered[0]?.date ?? '',
    to: ordered[ordered.length - 1]?.date ?? '',
    missingReceipts: lines.filter((line) => line.receipts.length === 0).length,
  }
}

/** Every receipt in the claim, in line order, for the images section. */
export function packReceipts(pack: ReimbursementPack): {
  attachment: TransactionAttachment
  transaction: Transaction
}[] {
  return pack.lines.flatMap((line) =>
    line.receipts.map((attachment) => ({ attachment, transaction: line.transaction })),
  )
}
