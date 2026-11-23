import type { Transaction } from '../domain/types'
import type { BulkTransactionPatch, NewTransaction } from '../domain/data/dataSource'
import type { Env } from './env'
import { descriptionNormSets } from './descriptionNorm'
import { BULK_CHANGED_MESSAGE } from '../domain/data/bulkEdit'
import { isGuardFailure } from './batchGuard'
import { getTransactionsByIds } from './dbTransactionQuery'
import { HttpError } from './http'
import { IN_ID_LIST, idList } from './sqlIdList'
import { assertOwnedAccount, assertOwnedCategory, assertOwnedFlag } from './ownership'
import { insertTransaction, reportSnapshotStatement } from './dbTransactionWrite'
import { COLUMN, patchValue, type PatchableTxnKey } from './dbTransactionPatch'
import {
  assertNoWithdrawalLeavingInvestment,
  assertNoneSettledElsewhere,
  assertPatchOwnership,
  settleGuard,
  settledGuardStatement,
} from './dbWriteGuards'

/**
 * The same, for many rows in one statement. One statement per row would put thousands in a batch
 * for a large selection, so the ids travel as one JSON list. Joins through `transactions` and
 * filters it to `owner`: an id in the list is not checked against the owner anywhere else, and the
 * UPDATE it runs beside excludes a foreign id only for itself.
 */
function maybeApplyAutoLabelToIdsStatement(
  env: Env,
  owner: string,
  ids: number[],
  flagId: number,
) {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO transaction_labels (transaction_id, label_id)
     SELECT t.id, f.auto_label_id
     FROM transactions t, flags f
     WHERE t.owner = ? AND t.id ${IN_ID_LIST} AND f.id = ? AND f.owner = ? AND f.auto_label_id IS NOT NULL`,
  ).bind(owner, idList(ids), flagId, owner)
}

/**
 * The statements a bulk update batches alongside its own UPDATE: the report
 * snapshot when settling, and the flag's auto-label when assigning a flag.
 */
function bulkFollowUpStatements(
  env: Env,
  owner: string,
  ids: number[],
  patch: BulkTransactionPatch,
) {
  const statements = []
  if (patch.settledBy != null) statements.push(reportSnapshotStatement(env, owner, patch.settledBy))
  if (patch.flagId != null) statements.push(maybeApplyAutoLabelToIdsStatement(env, owner, ids, patch.flagId))
  return statements
}

/** Insert many transactions; each row is validated and status-derived like insertTransaction. */
/**
 * Every account, category and flag the batch refers to, checked once each rather
 * than per row: the same ids repeat across an import, and the point is to know
 * before the first write whether any of them is going to fail.
 */
async function assertBulkInsertOwnership(
  env: Env,
  owner: string,
  inputs: NewTransaction[],
): Promise<void> {
  for (const id of new Set(inputs.map((i) => i.accountId))) {
    await assertOwnedAccount(env, owner, id)
  }
  for (const id of new Set(inputs.map((i) => i.categoryId))) {
    await assertOwnedCategory(env, owner, id)
  }
  for (const id of new Set(inputs.flatMap((i) => (i.flagId != null ? [i.flagId] : [])))) {
    await assertOwnedFlag(env, owner, id)
  }
}

export async function bulkInsertTransactions(
  env: Env,
  owner: string,
  inputs: NewTransaction[],
): Promise<Transaction[]> {
  // Check everything before writing anything, the same shape the bulk update settled
  // on. These inserts cannot be collapsed into one batch: resolvePlanLink reads
  // MAX(installment_index), so a plan-linked row has to see the row before it. That
  // left the loop free to commit half an import and then throw, telling the caller
  // the whole thing failed while a retry of the same file duplicated what had landed
  // (parseExportCsv does not read the id column back). An id belonging to someone
  // else, or to nothing, is the failure that actually happens here.
  await assertBulkInsertOwnership(env, owner, inputs)
  const saved: Transaction[] = []
  for (const input of inputs) {
    saved.push(await insertTransaction(env, owner, input))
  }
  return saved
}

/** Delete many rows in one statement; only ids owned by `owner` are removed. */
export async function deleteTransactions(
  env: Env,
  owner: string,
  ids: number[],
): Promise<number> {
  if (ids.length === 0) return 0
  const list = idList(ids)
  // Same cascade as the single delete, same reasons.
  //
  // The count is read first, in the same batch, and not taken from the delete's `meta.changes`: on D1 that
  // number includes the rows the rollup triggers write (docs/decisions/ledger-rollup.md), about three per row.
  const [counted] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS n FROM transactions WHERE owner = ? AND id ${IN_ID_LIST}`).bind(owner, list),
    env.DB.prepare(`DELETE FROM transaction_attachments WHERE owner = ? AND transaction_id ${IN_ID_LIST}`).bind(
      owner,
      list,
    ),
    // Scoped through a subquery, same reason as the single delete: transaction_labels
    // has no owner column, so a bare `transaction_id IN (...)` would let a caller
    // wipe another owner's label links for an id that is not theirs.
    env.DB.prepare(
      `DELETE FROM transaction_labels WHERE transaction_id IN (
           SELECT id FROM transactions WHERE owner = ? AND id ${IN_ID_LIST}
         )`,
    ).bind(owner, list),
    env.DB.prepare(`UPDATE transactions SET settled_by = NULL WHERE owner = ? AND settled_by ${IN_ID_LIST}`).bind(
      owner,
      list,
    ),
    env.DB.prepare(`DELETE FROM transactions WHERE owner = ? AND id ${IN_ID_LIST}`).bind(owner, list),
  ])
  return (counted?.results?.[0] as { n: number } | undefined)?.n ?? 0
}

/**
 * Every check a bulk update makes and the statements that carry it out, in the order they run as one
 * batch. Nothing is written here: a check that fails throws before the caller has anything to run, so
 * the ids form and the filter form refuse the same patches for the same reasons.
 */
export async function planBulkUpdate(
  env: Env,
  owner: string,
  ids: number[],
  patch: BulkTransactionPatch,
): Promise<D1PreparedStatement[]> {
  await assertPatchOwnership(env, owner, patch)
  const keys = (Object.keys(patch) as PatchableTxnKey[]).filter((k) => Object.hasOwn(COLUMN, k))
  if (keys.length === 0) throw new HttpError(400, 'Empty patch')
  const list = idList(ids)
  // Rejected before any row is touched. The UPDATE's guard clause silently *excludes* a
  // row settled elsewhere rather than failing, so deciding from its changed-row count
  // afterwards has already committed the rows that did qualify.
  await assertNoneSettledElsewhere(env, owner, ids, patch.settledBy)
  await assertNoWithdrawalLeavingInvestment(env, owner, ids, patch.type)
  const norm = descriptionNormSets(keys, patch)
  const sets = keys.map((k) => `${COLUMN[k]} = ?`).concat(norm.sets, "updated_at = datetime('now')")
  const patchRec = patch as Record<string, unknown>
  const values = keys.map((k) => patchValue(k, patchRec[k])).concat(norm.values)
  const guard = settleGuard(patch.settledBy)
  const write = env.DB.prepare(
    `UPDATE transactions SET ${sets.join(', ')} WHERE owner = ? AND id ${IN_ID_LIST}${guard.clause}`,
  ).bind(...values, owner, list, ...guard.values)
  const guards = patch.settledBy != null ? [settledGuardStatement(env, owner, ids, patch.settledBy)] : []
  return [write, ...bulkFollowUpStatements(env, owner, ids, patch), ...guards]
}

/** Runs a planned bulk batch; a guard in it that does not hold is a 409 and nothing was written. */
export async function runBulkBatch(
  env: Env,
  statements: D1PreparedStatement[],
): Promise<D1Result[]> {
  try {
    return await env.DB.batch(statements)
  } catch (error) {
    if (isGuardFailure(error)) throw new HttpError(409, BULK_CHANGED_MESSAGE)
    throw error
  }
}

export async function bulkUpdateTransactions(
  env: Env,
  owner: string,
  ids: number[],
  patch: BulkTransactionPatch,
): Promise<Transaction[]> {
  if (ids.length === 0) return []
  await runBulkBatch(env, await planBulkUpdate(env, owner, ids, patch))
  // One read for all the rows, with status and labels derived in SQL, so an edit costs the same statements for 1 id
  // as for 500.
  return getTransactionsByIds(env, owner, ids)
}
