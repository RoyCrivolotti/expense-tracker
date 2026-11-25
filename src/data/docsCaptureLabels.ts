/**
 * How the capture source keeps an auto-label in step with a flag. The rows and flags are the capture source's own
 * state, so each helper takes them and answers with new values rather than reaching for them.
 */
import type { Flag, Transaction } from '../types'

/** Add `labelId` to `labelIds` if it is not already there, without mutating the input. */
function withLabelAdded(
  labelIds: number[] | undefined,
  labelId: number,
): number[] {
  const current = labelIds ?? []
  return current.includes(labelId) ? current : [...current, labelId]
}

/**
 * Forward half, mirrors dbTransactionWrite.ts's maybeApplyAutoLabelStatement: a transaction
 * carrying a flag that has an auto-label picks it up too. A flag with no
 * autoLabelId, or a transaction with no flagId, is left untouched.
 */
export function withAutoLabel(
  txn: Transaction,
  flags: Flag[],
): Transaction {
  if (txn.flagId == null) return txn
  const labelId = flags.find((f) => f.id === txn.flagId)?.autoLabelId
  if (labelId == null) return txn
  const labelIds = withLabelAdded(txn.labelIds, labelId)
  return labelIds === txn.labelIds ? txn : { ...txn, labelIds }
}

/**
 * Retroactive half, mirrors dbFlags.ts's applyLabelToFlaggedTransactionsStatement:
 * configuring a flag's auto-label also labels every transaction already carrying
 * that flag, deduped against one it already has some other way.
 */
export function applyAutoLabelToFlagged(
  rows: Transaction[],
  flagId: number,
  labelId: number,
): Transaction[] {
  return rows.map((t) => {
    if (t.flagId !== flagId) return t
    const labelIds = withLabelAdded(t.labelIds, labelId)
    return labelIds === t.labelIds ? t : { ...t, labelIds }
  })
}
