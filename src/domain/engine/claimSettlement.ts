import type { Account } from '../types'
import type { FlagGroup } from './flagGroups'

/**
 * The prefill for recording a reimbursement against a flag.
 *
 * Pure, so the choices below are testable — they are the part that is easy to
 * get subtly wrong, and each one is wrong in a way that corrupts a number
 * elsewhere in the app rather than throwing.
 */
export interface SettlementSeed {
  amountCents: number
  accountId: number
  categoryId: number
  description: string
}

/**
 * Where the money lands. **Must settle immediately.**
 *
 * A reimbursement is a bank transfer arriving, and recording it against a
 * deferred card makes `deriveStatus` call it `forecast`. From there
 * `cashReconciliation` books it as a *negative unpaid card liability* rather
 * than cash in, `cashMovement` is unchanged — so the actual-cash gap this
 * feature exists to close stays open — and `monthlyTotals` and `categoryBudget`
 * ignore it entirely until the card statement is marked paid. Nothing errors;
 * every figure is simply wrong.
 */
function settlementAccountId(accounts: Account[], preferredId: number): number {
  const immediate = accounts.filter((a) => a.active && a.settlement === 'immediate')
  const preferred = immediate.find((a) => a.id === preferredId)
  return preferred?.id ?? immediate[0]?.id ?? accounts.find((a) => a.active)?.id ?? 0
}

/**
 * Where it is booked. The category the claim spent most in, so the credit lands
 * against the budget it came out of.
 *
 * Ties break on the lowest id for a stable answer — the same claim must prefill
 * the same way twice. Note the credit falls in the budget month it is *paid*,
 * not the month the spending happened; that is how this app has always treated
 * refunds, and the modal is editable if you would rather book it elsewhere.
 */
function dominantCategoryId(group: FlagGroup): number {
  const spend = new Map<number, number>()
  for (const txn of group.transactions) {
    if (txn.type !== 'expense') continue
    spend.set(txn.categoryId, (spend.get(txn.categoryId) ?? 0) + txn.amountCents)
  }
  let bestId = group.transactions[0]?.categoryId ?? 0
  let bestCents = -1
  for (const [categoryId, cents] of spend) {
    if (cents > bestCents || (cents === bestCents && categoryId < bestId)) {
      bestId = categoryId
      bestCents = cents
    }
  }
  return bestId
}

/**
 * Build the prefill, or null when there is nothing outstanding.
 *
 * Null matters: `group.totalCents` is already net of anything reimbursed, so a
 * fully settled claim would otherwise prefill 0,00 € — which the form then
 * rejects for being zero. Better to not offer the action at all.
 */
export function buildSettlementSeed(
  group: FlagGroup,
  accounts: Account[],
  preferredAccountId: number,
): SettlementSeed | null {
  if (group.totalCents <= 0) return null
  return {
    amountCents: group.totalCents,
    accountId: settlementAccountId(accounts, preferredAccountId),
    categoryId: dominantCategoryId(group),
    description: `Reimbursement — ${group.flag.name}`,
  }
}
