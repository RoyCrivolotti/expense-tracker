import type { BulkTransactionPatch } from '../domain/data/dataSource'
import { AMOUNT_SIGN_MESSAGE, amountSignAllowed } from '../domain/data/amountSign'
import type { Env } from './env'
import type { TxnRow } from './rows'
import { guardSql } from './batchGuard'
import { HttpError } from './http'
import { IN_ID_LIST, idList } from './sqlIdList'
import { assertOwnedAccount, assertOwnedCategory, assertOwnedFlag, assertOwnedTransaction } from './ownership'
import type { TxnPatch } from './dbTransactionPatch'

/**
 * The re-settle guard, shared by both update paths.
 *
 * Only applied when *setting* a settlement. Written as a conditional clause rather
 * than `settled_by IS NULL OR ? IS NULL OR settled_by = ?` because binding NULL into
 * an `=` comparison yields NULL, not true — SQL's three-valued logic would make a
 * legitimate clear-the-link patch block itself.
 */
export function settleGuard(settledBy: number | null | undefined): { clause: string; values: number[] } {
  if (settledBy == null) return { clause: '', values: [] }
  return { clause: ' AND (settled_by IS NULL OR settled_by = ?)', values: [settledBy] }
}

const SETTLED_ELSEWHERE = 'Some of those transactions are already settled by another reimbursement'

/**
 * Refuse the whole batch if any target is already settled by a different payment.
 *
 * Mirrors the in-memory repository, which checks every target before mutating any —
 * the two must agree, or the integration suite passes against a stricter fake than
 * production. A batch cannot express this: every statement in one runs regardless of
 * what the others found, so check-then-mutate needs the two round trips.
 */
export async function assertNoneSettledElsewhere(
  env: Env,
  owner: string,
  ids: number[],
  settledBy: number | null | undefined,
): Promise<void> {
  if (settledBy == null) return
  const { results } = await env.DB.prepare(
    `SELECT id FROM transactions
     WHERE owner = ? AND id ${IN_ID_LIST} AND settled_by IS NOT NULL AND settled_by != ?`,
  )
    .bind(owner, idList(ids), settledBy)
    .all<{ id: number }>()
  if ((results ?? []).length > 0) throw new HttpError(409, SETTLED_ELSEWHERE)
}

/**
 * A negative amount belongs only on an investment row. The service checks a patch that
 * carries both fields; a patch with one of them needs the stored row for the other.
 */
export async function assertAmountSignAgainstRow(
  env: Env,
  owner: string,
  id: number,
  patch: TxnPatch,
): Promise<void> {
  const hasAmount = patch.amountCents != null
  const hasType = patch.type != null
  // Both present: the service already judged them. Neither: nothing to judge.
  if (hasAmount === hasType) return
  // A positive amount is fine on any type; an investment takes either sign.
  if (hasAmount && patch.amountCents! >= 0) return
  if (hasType && patch.type === 'investment') return
  const row = await env.DB.prepare('SELECT type, amount_cents FROM transactions WHERE id = ? AND owner = ?')
    .bind(id, owner)
    .first<{ type: TxnRow['type']; amount_cents: number }>()
  // A missing row is the UPDATE's own not-found to report.
  if (!row) return
  const amount = hasAmount ? patch.amountCents! : row.amount_cents
  const type = hasType ? patch.type! : row.type
  if (!amountSignAllowed(amount, type)) throw new HttpError(400, AMOUNT_SIGN_MESSAGE)
}

/** A type change away from investment must not leave a withdrawal on an expense row. */
export async function assertNoWithdrawalLeavingInvestment(
  env: Env,
  owner: string,
  ids: number[],
  type: BulkTransactionPatch['type'],
): Promise<void> {
  if (type == null || type === 'investment') return
  const { results } = await env.DB.prepare(
    `SELECT id FROM transactions WHERE owner = ? AND id ${IN_ID_LIST} AND amount_cents < 0`,
  )
    .bind(owner, idList(ids))
    .all<{ id: number }>()
  if ((results ?? []).length > 0) throw new HttpError(400, AMOUNT_SIGN_MESSAGE)
}

/**
 * Last in a settling batch: fails, and so undoes the batch, unless every row of the owner in `ids` is
 * now settled by `settledBy`. `assertNoneSettledElsewhere` refuses the common case before anything is
 * written; this covers a payment that settled one of the rows between that check and the batch, which
 * the UPDATE's guard clause would otherwise skip over while the rest of the rows were committed.
 */
export function settledGuardStatement(
  env: Env,
  owner: string,
  ids: number[],
  settledBy: number,
) {
  return env.DB.prepare(
    guardSql(
      `NOT EXISTS (SELECT 1 FROM transactions
         WHERE owner = ? AND id ${IN_ID_LIST} AND (settled_by IS NULL OR settled_by != ?))`,
    ),
  ).bind(owner, idList(ids), settledBy)
}

/** Every foreign key a transaction patch can carry must belong to the same owner. */
export async function assertPatchOwnership(
  env: Env,
  owner: string,
  patch: TxnPatch,
): Promise<void> {
  if (patch.accountId != null) await assertOwnedAccount(env, owner, patch.accountId)
  if (patch.categoryId != null) await assertOwnedCategory(env, owner, patch.categoryId)
  if (patch.flagId != null) await assertOwnedFlag(env, owner, patch.flagId)
  if (patch.settledBy != null) await assertOwnedTransaction(env, owner, patch.settledBy)
}
