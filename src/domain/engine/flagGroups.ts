import type { Flag, Transaction } from '../types'
import { netSpendCents } from './transactions'

/**
 * Return the transaction without its flag.
 *
 * `exactOptionalPropertyTypes` is on, so "unflagged" has to mean *the key is
 * absent*, not `flagId: undefined` — the latter round-trips through JSON as a
 * different shape than the server ever sends. Destructuring in the parameter
 * position also keeps the discarded binding inside ESLint's `argsIgnorePattern`.
 */
export function withoutFlag<T extends { flagId?: number }>({
  flagId: _flagId,
  ...rest
}: T): Omit<T, 'flagId'> {
  return rest
}

/**
 * Return the transaction without its reimbursement link.
 *
 * Same reason as `withoutFlag`: under `exactOptionalPropertyTypes`, "not
 * reimbursed" has to mean the key is absent rather than `settledBy: undefined`,
 * which round-trips through JSON as a shape the server never sends.
 */
export function withoutSettlement<T extends { settledBy?: number }>({
  settledBy: _settledBy,
  ...rest
}: T): Omit<T, 'settledBy'> {
  return rest
}

export interface FlagGroup {
  flag: Flag
  transactions: Transaction[]
  count: number
  /**
   * Net spend for the group, signed the same way the Transactions tab's own
   * "Net spend" line is — refunds subtract. For the reimbursement case this is
   * the number that matters: what you are actually out of pocket.
   */
  totalCents: number
}

/**
 * Bucket transactions by the flag they carry.
 *
 * Deliberate behaviours, each covered by a test:
 * - Groups follow `flags` order (the user's sort), never transaction order.
 * - A flag with no matching transactions is omitted: the Flagged card is a work
 *   list, not a legend.
 * - A `flagId` pointing at a flag that isn't in `flags` is dropped rather than
 *   bucketed under "Unknown". That happens legitimately — a stale client, or a
 *   flag deleted in another tab — and it must not throw.
 * - Cancelled transactions are excluded entirely: you are not claiming back
 *   something that never happened.
 * - Reimbursed rows (`settledBy` set) drop out, which is how a claim ends. They
 *   keep their flag, so deleting the reimbursement brings them straight back and
 *   "what was in the June claim" stays answerable.
 * - Only `expense` and `refund` rows are admitted. An income or investment row
 *   carrying a flag is a mis-typed transaction, and letting one in made `count`
 *   and `totalCents` describe different sets — `netSpendCents` skips those two
 *   types, so a flag holding one income row read "3 items - 40,00 EUR" with
 *   nothing on screen to explain the gap. Excluding them keeps `transactions`,
 *   `count` and `totalCents` talking about the same rows.
 * - An archived flag drops out, per the contract on `Flag` in types.ts. This is
 *   the feature's only "done": you flag a trip, claim it, get paid, archive the
 *   flag, and the card stops nagging — without destroying which transactions
 *   were in the claim, the way unflagging or deleting them would.
 */
export function groupTransactionsByFlag(
  transactions: Transaction[],
  flags: Flag[],
): FlagGroup[] {
  const byFlag = bucketByFlag(transactions)

  const groups: FlagGroup[] = []
  for (const flag of flags) {
    if (!flag.active) continue
    const group = toGroup(flag, byFlag.get(flag.id))
    if (group) groups.push(group)
  }
  return groups
}

/**
 * One flag's group, **including an archived flag**.
 *
 * Separate from `groupTransactionsByFlag` because archiving is how a claim is
 * marked done, and the claim still has to be printable afterwards — an
 * employer asking for it again a month later should not require un-archiving.
 * Every other rule (cancelled rows out, non-spend types out, unknown flag ids
 * ignored) lives in the shared helpers below, so the two cannot drift.
 */
export function buildFlagGroup(
  flagId: number,
  transactions: Transaction[],
  flags: Flag[],
): FlagGroup | null {
  const flag = flags.find((f) => f.id === flagId)
  if (!flag) return null
  return toGroup(flag, bucketByFlag(transactions).get(flagId))
}

function bucketByFlag(transactions: Transaction[]): Map<number, Transaction[]> {
  const byFlag = new Map<number, Transaction[]>()
  for (const txn of transactions) {
    if (txn.flagId == null || txn.status === 'cancelled') continue
    if (txn.type !== 'expense' && txn.type !== 'refund') continue
    // Reimbursed rows keep their flag but leave the work list: the card answers
    // "what am I still owed", and a row that has been paid back is not that.
    // They are still reachable — the claim they belonged to can be reprinted.
    if (txn.settledBy != null) continue
    const bucket = byFlag.get(txn.flagId)
    if (bucket) bucket.push(txn)
    else byFlag.set(txn.flagId, [txn])
  }
  return byFlag
}

function toGroup(flag: Flag, rows: Transaction[] | undefined): FlagGroup | null {
  if (!rows || rows.length === 0) return null
  return {
    flag,
    transactions: rows,
    count: rows.length,
    totalCents: netSpendCents(rows),
  }
}

/** Rolled-up figures for the collapsed Flagged header. */
export function summarizeFlagGroups(groups: FlagGroup[]): {
  count: number
  totalCents: number
} {
  return groups.reduce(
    (acc, group) => ({
      count: acc.count + group.count,
      totalCents: acc.totalCents + group.totalCents,
    }),
    { count: 0, totalCents: 0 },
  )
}
