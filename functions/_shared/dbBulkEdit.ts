/**
 * Bulk writes on a filter. The rows are the ones the paged reads would list (`idsSql` shares their WHERE),
 * found in one statement and checked against what the user was shown before anything is written. The write
 * itself is the ids form's, planned by the same function, with a guard first in the batch that makes the
 * check hold again at the moment of writing: a row that joined or left the filter in between rolls it back.
 */
import {
  MAX_BULK_LABEL_LINKS,
  MAX_FILTER_EDIT_ROWS,
  bulkCountMessage,
  bulkTooManyLinksMessage,
  bulkTooManyMessage,
  isFilterTarget,
  type BulkTarget,
  type FilterTarget,
} from '../domain/data/bulkEdit'
import type { BulkTransactionPatch } from '../domain/data/dataSource'
import type { Env } from './env'
import { planBulkUpdate, runBulkBatch } from './dbWrite'
import { HttpError } from './http'
import { assertOwnedLabel } from './ownership'
import { IN_ID_LIST, idList } from './sqlIdList'
import { idsSql, matchGuardSql } from './transactionQuerySql'

/**
 * The ids the filter matches, when there are exactly `expectedCount` of them. One row more than the cap
 * is read so that a filter that reaches it is told apart from one that stops there.
 */
async function resolveFilter(env: Env, owner: string, target: FilterTarget): Promise<number[]> {
  const { sql, params } = idsSql(owner, target.filter, MAX_FILTER_EDIT_ROWS + 1)
  const { results } = await env.DB.prepare(sql)
    .bind(...params)
    .all<{ id: number }>()
  const ids = (results ?? []).map((row) => row.id)
  if (ids.length > MAX_FILTER_EDIT_ROWS) throw new HttpError(400, bulkTooManyMessage())
  if (ids.length !== target.expectedCount) {
    throw new HttpError(409, bulkCountMessage(ids.length, target.expectedCount))
  }
  return ids
}

function matchGuard(env: Env, owner: string, target: FilterTarget, ids: number[]): D1PreparedStatement {
  const { sql, params } = matchGuardSql(owner, target.filter, ids, MAX_FILTER_EDIT_ROWS)
  return env.DB.prepare(sql).bind(...params)
}

/** The ids-form bulk edit, for the rows a filter matches. Returns how many rows were changed. */
export async function bulkUpdateTransactionsByFilter(
  env: Env,
  owner: string,
  target: FilterTarget,
  patch: BulkTransactionPatch,
): Promise<{ updated: number }> {
  const ids = await resolveFilter(env, owner, target)
  if (ids.length === 0) return { updated: 0 }
  const statements = await planBulkUpdate(env, owner, ids, patch)
  await runBulkBatch(env, [matchGuard(env, owner, target, ids), ...statements])
  return { updated: ids.length }
}

/** The rows a bulk write is for, and the guard that must open its batch when they came from a filter. */
async function resolveTarget(
  env: Env,
  owner: string,
  target: BulkTarget,
): Promise<{ ids: number[]; guard: D1PreparedStatement[] }> {
  if (!isFilterTarget(target)) return { ids: target.ids, guard: [] }
  const ids = await resolveFilter(env, owner, target)
  return { ids, guard: [matchGuard(env, owner, target, ids)] }
}

/**
 * Adds the labels to the rows, keeping the labels they have. One `INSERT OR IGNORE` for every pair, so a
 * row that already has a label costs nothing and the whole request is one batch. A row that is not the
 * owner's, or is not there, is left out of `matched` and gets nothing.
 */
export async function addLabelsToTransactions(
  env: Env,
  owner: string,
  target: BulkTarget,
  labelIds: number[],
): Promise<{ matched: number; added: number }> {
  for (const labelId of labelIds) await assertOwnedLabel(env, owner, labelId)
  const { ids, guard } = await resolveTarget(env, owner, target)
  if (ids.length * labelIds.length > MAX_BULK_LABEL_LINKS) {
    throw new HttpError(400, bulkTooManyLinksMessage())
  }
  if (ids.length === 0) return { matched: 0, added: 0 }
  const results = await runBulkBatch(env, [
    ...guard,
    env.DB.prepare(
      `INSERT OR IGNORE INTO transaction_labels (transaction_id, label_id)
       SELECT t.id, l.id FROM transactions t, labels l
       WHERE t.owner = ? AND t.id ${IN_ID_LIST} AND l.owner = ? AND l.id ${IN_ID_LIST}`,
    ).bind(owner, idList(ids), owner, idList(labelIds)),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM transactions WHERE owner = ? AND id ${IN_ID_LIST}`).bind(
      owner,
      idList(ids),
    ),
  ])
  const inserted = results[guard.length]
  const counted = results[guard.length + 1]
  return {
    matched: (counted?.results?.[0] as { n: number } | undefined)?.n ?? 0,
    added: inserted?.meta?.changes ?? 0,
  }
}
