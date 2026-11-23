import type { StoredTransaction, Transaction } from '../domain/types'
import type { NewTransaction } from '../domain/data/dataSource'
import { deriveStatus } from '../domain/engine/status'
import type { Env } from './env'
import { toAccount, toStatement, toStoredTxn, type AccountRow, type StatementRow, type TxnRow } from './rows'
import { descriptionNorm, descriptionNormSets } from './descriptionNorm'
import { HttpError } from './http'
import { assertOwnedAccount, assertOwnedCategory, assertOwnedFlag } from './ownership'
import { maybeCompletePlan, planLinkColumns, resolvePlanLink } from './dbPlanLink'
import { COLUMN, patchValue, type PatchableTxnKey, type TxnPatch } from './dbTransactionPatch'
import { assertAmountSignAgainstRow, assertPatchOwnership, settleGuard } from './dbWriteGuards'

/**
 * Attach derived status and current labels to a stored row. Exported so
 * dbLabels.ts's `setTransactionLabels` can return a transaction reflecting the
 * write it just made, using the same choke point every other write path does —
 * the alternative (each write path re-deriving labelIds itself) is exactly the
 * kind of drift that would let one of them silently keep returning `[]`.
 */
export async function deriveOne(
  env: Env,
  owner: string,
  stored: StoredTransaction,
): Promise<Transaction> {
  const acc = await env.DB.prepare('SELECT * FROM accounts WHERE id = ? AND owner = ?')
    .bind(stored.accountId, owner)
    .first<AccountRow>()
  const stmt = await env.DB.prepare(
    'SELECT * FROM account_statements WHERE account_id = ? AND year_month = ? AND owner = ?',
  )
    .bind(stored.accountId, stored.budgetMonth, owner)
    .first<StatementRow>()
  const account = acc ? toAccount(acc) : undefined
  const statements = stmt ? [toStatement(stmt)] : []
  const status = account ? deriveStatus(stored, account, statements) : 'posted'
  // Joined to labels, not read off transaction_labels alone: a row whose label
  // was since deleted is dropped here rather than returned, matching loadDataset
  // (db.ts) and the tolerance flagGroups.ts already gives a dangling flagId.
  const { results } = await env.DB.prepare(
    `SELECT tl.label_id FROM transaction_labels tl
       JOIN labels l ON l.id = tl.label_id
       WHERE tl.transaction_id = ?`,
  )
    .bind(stored.id)
    .all<{ label_id: number }>()
  const labelIds = (results ?? []).map((r) => r.label_id)
  return { ...stored, status, labelIds }
}

/**
 * The forward half of a flag's auto-label: whenever a write assigns `flagId` to
 * `transactionId`, that flag's configured label (if any) is applied too. A
 * statement, not a run-it-here call, so a caller can batch it with its own write.
 * `INSERT OR IGNORE` plus the `auto_label_id IS NOT NULL` filter make this a safe
 * no-op both for a flag with no auto-label and for a row that already has it.
 */
function maybeApplyAutoLabelStatement(
  env: Env,
  owner: string,
  transactionId: number,
  flagId: number,
) {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO transaction_labels (transaction_id, label_id)
     SELECT t.id, f.auto_label_id
     FROM transactions t, flags f
     WHERE t.id = ? AND t.owner = ? AND f.id = ? AND f.owner = ? AND f.auto_label_id IS NOT NULL`,
  ).bind(transactionId, owner, flagId, owner)
}

export async function insertTransaction(
  env: Env,
  owner: string,
  input: NewTransaction,
): Promise<Transaction> {
  await assertOwnedAccount(env, owner, input.accountId)
  await assertOwnedCategory(env, owner, input.categoryId)
  if (input.flagId != null) await assertOwnedFlag(env, owner, input.flagId)
  const planLink = await resolvePlanLink(env, owner, input)
  const row = await env.DB.prepare(
    `INSERT INTO transactions
       (owner, date, budget_month, description, description_norm, account_id, category_id, type, amount_cents, cancelled, notes, plan_id, installment_index, flag_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      owner,
      input.date,
      input.budgetMonth,
      input.description,
      descriptionNorm(input.description),
      input.accountId,
      input.categoryId,
      input.type,
      input.amountCents,
      input.cancelled ? 1 : 0,
      input.notes ?? null,
      planLink?.planId ?? null,
      planLink?.installmentIndex ?? null,
      input.flagId ?? null,
    )
    .first<TxnRow>()
  if (!row) throw new HttpError(500, 'Insert failed')
  if (planLink) await maybeCompletePlan(env, owner, planLink.planId)
  if (input.flagId != null) await maybeApplyAutoLabelStatement(env, owner, row.id, input.flagId).run()
  return deriveOne(env, owner, toStoredTxn(row))
}

/**
 * Stamp a reimbursement payment with what it covers.
 *
 * Returns the statement rather than running it, so callers can put it in the same
 * batch as the settle. D1 runs a batch as one transaction, sequentially, so this sees
 * the `settled_by` the statement before it wrote, and a failure here rolls that settle
 * back. A settle that committed without its record is the exact inconsistency these
 * columns exist to prevent.
 *
 * Computed from the rows rather than passed in by the client: it is a record of what
 * the database actually held, not of what a caller claimed. Re-run on every settle, so
 * adding rows to an existing payment keeps it true.
 */
export const REPORT_SNAPSHOT_SQL = `UPDATE transactions
     SET report_count = (
           SELECT COUNT(*) FROM transactions WHERE owner = ?1 AND settled_by = ?2
         ),
         report_covered_cents = (
           SELECT COALESCE(SUM(CASE WHEN type = 'refund' THEN -amount_cents ELSE amount_cents END), 0)
           FROM transactions WHERE owner = ?1 AND settled_by = ?2
         )
     WHERE id = ?2 AND owner = ?1`

export function reportSnapshotStatement(
  env: Env,
  owner: string,
  paymentId: number,
) {
  return env.DB.prepare(REPORT_SNAPSHOT_SQL).bind(owner, paymentId)
}

export async function updateTransaction(
  env: Env,
  owner: string,
  id: number,
  patch: TxnPatch,
): Promise<Transaction> {
  const keys = (Object.keys(patch) as PatchableTxnKey[]).filter((k) => Object.hasOwn(COLUMN, k))
  const link = await planLinkColumns(env, owner, id, patch)
  if (keys.length === 0 && link.sets.length === 0) throw new HttpError(400, 'Empty patch')
  await assertPatchOwnership(env, owner, patch)
  await assertAmountSignAgainstRow(env, owner, id, patch)
  const norm = descriptionNormSets(keys, patch)
  const sets = keys.map((k) => `${COLUMN[k]} = ?`).concat(norm.sets, link.sets, "updated_at = datetime('now')")
  const values = keys.map((k) => patchValue(k, patch[k])).concat(norm.values, link.values)
  const guard = settleGuard(patch.settledBy)
  const row = await env.DB.prepare(
    `UPDATE transactions SET ${sets.join(', ')} WHERE id = ? AND owner = ?${guard.clause} RETURNING *`,
  )
    .bind(...values, id, owner, ...guard.values)
    .first<TxnRow>()
  if (!row) {
    // The guard and a genuinely missing row both return zero rows. Tell them apart
    // rather than reporting "not found" for a row the caller can see.
    if (patch.settledBy != null) {
      const exists = await env.DB.prepare('SELECT 1 AS ok FROM transactions WHERE id = ? AND owner = ?')
        .bind(id, owner)
        .first<{ ok: number }>()
      if (exists) throw new HttpError(409, 'Transaction is already settled by another reimbursement')
    }
    throw new HttpError(404, 'Transaction not found')
  }
  if (patch.settledBy != null) await reportSnapshotStatement(env, owner, patch.settledBy).run()
  if (patch.flagId != null) await maybeApplyAutoLabelStatement(env, owner, row.id, patch.flagId).run()
  // installmentIndex alone is a no-op in planLinkColumns (it requires planId in
  // the same patch), so it doesn't need its own check here.
  if ('cancelled' in patch || 'planId' in patch) await maybeCompletePlan(env, owner, row.plan_id)
  return deriveOne(env, owner, toStoredTxn(row))
}

/**
 * Attachment rows go with their transaction, in the same batch.
 *
 * D1 cannot express this as an enforced cascade (ALTER cannot add a foreign
 * key), so it is done explicitly — and it must be atomic: a transaction deleted
 * without its attachment rows leaves metadata whose byte_size keeps counting
 * against the owner's storage quota, reachable from no UI, forever. Deleting the
 * R2 bytes is the caller's job afterwards (see deleteWithReceipts);
 * an R2 delete cannot join a D1 batch.
 *
 * A row that is missing or not the owner's is not an error: the two cannot be told apart, and a delete whose answer was
 * lost is repeated by the browser, so the repeat has to end the way the first one did.
 */
export async function deleteTransaction(
  env: Env,
  owner: string,
  id: number,
): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM transaction_attachments WHERE transaction_id = ? AND owner = ?').bind(id, owner),
    // Belt-and-suspenders alongside transaction_labels' own ON DELETE CASCADE
    // (migration 0028) — see that migration's comment on why the cascade alone
    // is not trusted. Scoped through a subquery rather than a bare
    // `transaction_id = ?`: transaction_labels carries no owner column of its
    // own, and an unscoped delete here would let a caller who does not own this
    // id still wipe another owner's label links for it.
    env.DB.prepare(
      'DELETE FROM transaction_labels WHERE transaction_id IN (SELECT id FROM transactions WHERE id = ? AND owner = ?)',
    ).bind(id, owner),
    // Releasing what this row reimbursed, if it was a reimbursement. Without it
    // the rows it covered keep pointing at a transaction that no longer exists
    // and stay out of the Flagged card — silently un-owed.
    env.DB.prepare('UPDATE transactions SET settled_by = NULL WHERE settled_by = ? AND owner = ?').bind(id, owner),
    env.DB.prepare('DELETE FROM transactions WHERE id = ? AND owner = ?').bind(id, owner),
  ])
}
