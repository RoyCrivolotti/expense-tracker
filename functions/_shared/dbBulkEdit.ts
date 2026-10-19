/**
 * Bulk writes on a filter. The rows are the ones the paged reads would list (`idsSql` shares their WHERE),
 * found in one statement and checked against what the user was shown before anything is written. The write
 * itself is the ids form's, planned by the same function, with a guard first in the batch that makes the
 * check hold again at the moment of writing: a row that joined or left the filter in between rolls it back.
 */
import {
  MAX_FILTER_EDIT_ROWS,
  bulkCountMessage,
  bulkTooManyMessage,
  type FilterTarget,
} from '../domain/data/bulkEdit'
import type { BulkTransactionPatch } from '../domain/data/dataSource'
import type { Env } from './env'
import { planBulkUpdate, runBulkBatch } from './dbWrite'
import { HttpError } from './http'
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
