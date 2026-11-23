import type { NewTransaction } from '../domain/data/dataSource'

// Plan link columns are patched through a dedicated path (planLinkColumns), not
// the generic COLUMN map, so the schedule/index invariants stay centralised in
// resolvePlanLink for both insert and update.
export type PatchableTxnKey =
  | Exclude<keyof NewTransaction, 'planId' | 'installmentIndex'>
  // Not on NewTransaction — a row is never created already reimbursed; the link
  // is only ever set afterwards, by recording the reimbursement.
  | 'settledBy'

export const COLUMN: Record<PatchableTxnKey, string> = {
  date: 'date',
  budgetMonth: 'budget_month',
  description: 'description',
  accountId: 'account_id',
  categoryId: 'category_id',
  type: 'type',
  amountCents: 'amount_cents',
  cancelled: 'cancelled',
  notes: 'notes',
  flagId: 'flag_id',
  settledBy: 'settled_by',
}

export function patchValue(
  key: PatchableTxnKey,
  value: unknown,
): unknown {
  if (key === 'cancelled') return value ? 1 : 0
  return value ?? null
}

/** The patchable shape: NewTransaction's fields plus the settlement link. */
export type TxnPatch = Partial<NewTransaction> & { settledBy?: number | null }
