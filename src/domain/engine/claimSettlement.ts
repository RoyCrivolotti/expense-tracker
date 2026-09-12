import type { Account, Transaction } from '../types'
import type { FlagGroup } from './flagGroups'

/**
 * The opening state of a reimbursement, before the user adjusts it.
 *
 * A reimbursement covers the transactions you select, not the whole flag: five
 * rows under "Work travel" can span two trips claimed separately, and an
 * employer may approve some lines and reject others. A rejected line is simply
 * left unselected — it stays flagged and still counts as owed.
 */
export interface SettlementDraft {
  /** Rows offered for selection, oldest first. */
  candidates: Transaction[]
  /** Selected by default: covering the whole claim is the common case. */
  selectedIds: number[]
  amountCents: number
  accountId: number
  categoryId: number
  description: string
}

/**
 * Where the money lands. **Must settle immediately.**
 *
 * A reimbursement is a bank transfer arriving, and booking it against a deferred
 * card makes `deriveStatus` call it `forecast`. From there `cashReconciliation`
 * treats it as a *negative unpaid card liability* rather than cash in,
 * `cashMovement` is unchanged — so the actual-cash gap this feature exists to
 * close stays open — and `monthlyTotals` and `categoryBudget` ignore it entirely
 * until the card statement is marked paid. Nothing errors; the figures are
 * simply wrong.
 */
export function settlementAccountId(accounts: Account[], preferredId: number): number {
  const immediate = accounts.filter((a) => a.active && a.settlement === 'immediate')
  const preferred = immediate.find((a) => a.id === preferredId)
  return preferred?.id ?? immediate[0]?.id ?? accounts.find((a) => a.active)?.id ?? 0
}

/**
 * Where it is booked: the category the selected rows spent most in, so the
 * credit lands against the budget it came out of.
 *
 * Ties break on the lowest id, so the same selection prefills the same way
 * twice. Refunds are ignored when weighing, or a credit already booked against
 * one category would make it look like where the spending happened.
 */
export function dominantCategoryId(rows: Transaction[]): number {
  const spend = new Map<number, number>()
  for (const txn of rows) {
    if (txn.type !== 'expense') continue
    spend.set(txn.categoryId, (spend.get(txn.categoryId) ?? 0) + txn.amountCents)
  }
  let bestId = rows[0]?.categoryId ?? 0
  let bestCents = -1
  for (const [categoryId, cents] of spend) {
    if (cents > bestCents || (cents === bestCents && categoryId < bestId)) {
      bestId = categoryId
      bestCents = cents
    }
  }
  return bestId
}

/** What the selected rows come to: expenses add, refunds subtract. */
export function selectedTotalCents(rows: Transaction[], selectedIds: Iterable<number>): number {
  const wanted = new Set(selectedIds)
  let total = 0
  for (const txn of rows) {
    if (!wanted.has(txn.id)) continue
    total += txn.type === 'refund' ? -txn.amountCents : txn.amountCents
  }
  return total
}

/**
 * Build the opening state, or null when there is nothing outstanding.
 *
 * Null matters: the group's total is already net of anything reimbursed, so a
 * settled claim would otherwise open on 0,00 € — which the form then rejects for
 * being zero. Better not to offer the action at all.
 */
export function buildSettlementDraft(
  group: FlagGroup,
  accounts: Account[],
  preferredAccountId: number,
): SettlementDraft | null {
  if (group.totalCents <= 0) return null
  // Expenses only. A refund on the flag — a ticket handed back to the vendor —
  // already reduces what is owed; it is not a line an employer reimburses, and
  // offering it for selection let the total go *negative*, at which point the
  // sheet was proposing to record a payment of minus six euros.
  //
  // Oldest first, matching the claim document rather than the transaction list:
  // you read down a claim deciding what was paid.
  const candidates = group.transactions
    .filter((t) => t.type !== 'refund')
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
  if (candidates.length === 0) return null
  const selectedIds = candidates.map((t) => t.id)
  return {
    candidates,
    selectedIds,
    amountCents: selectedTotalCents(candidates, selectedIds),
    accountId: settlementAccountId(accounts, preferredAccountId),
    categoryId: dominantCategoryId(candidates),
    description: `Reimbursement — ${group.flag.name}`,
  }
}
