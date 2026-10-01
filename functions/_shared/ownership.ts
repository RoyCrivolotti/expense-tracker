import type { Env } from './env'
import { HttpError } from './http'

export async function assertOwnedAccount(
  env: Env,
  owner: string,
  accountId: number,
): Promise<void> {
  const row = await env.DB.prepare('SELECT 1 AS ok FROM accounts WHERE id = ? AND owner = ?')
    .bind(accountId, owner)
    .first<{ ok: number }>()
  if (!row) throw new HttpError(400, 'Invalid accountId')
}

export async function assertOwnedCategory(
  env: Env,
  owner: string,
  categoryId: number,
): Promise<void> {
  const row = await env.DB.prepare('SELECT 1 AS ok FROM categories WHERE id = ? AND owner = ?')
    .bind(categoryId, owner)
    .first<{ ok: number }>()
  if (!row) throw new HttpError(400, 'Invalid categoryId')
}

export async function assertOwnedFlag(env: Env, owner: string, flagId: number): Promise<void> {
  const row = await env.DB.prepare('SELECT 1 AS ok FROM flags WHERE id = ? AND owner = ?')
    .bind(flagId, owner)
    .first<{ ok: number }>()
  if (!row) throw new HttpError(400, 'Invalid flagId')
}

export async function assertOwnedLabel(env: Env, owner: string, labelId: number): Promise<void> {
  const row = await env.DB.prepare('SELECT 1 AS ok FROM labels WHERE id = ? AND owner = ?')
    .bind(labelId, owner)
    .first<{ ok: number }>()
  if (!row) throw new HttpError(400, 'Invalid labelId')
}

/**
 * A transaction id used as a foreign key needs the same tenancy check as any other —
 * without it a patch can aim at an id belonging to someone else, and a delete-time
 * cleanup scoped `AND owner = ?` could never reconcile it. `settledBy` was the first
 * caller (a reimbursement payment id) and stays the default error field; the labels
 * PUT route passes its own since the id there is a path parameter, not a patch field.
 */
export async function assertOwnedTransaction(
  env: Env,
  owner: string,
  transactionId: number,
  field = 'settledBy',
): Promise<void> {
  const row = await env.DB.prepare('SELECT 1 AS ok FROM transactions WHERE id = ? AND owner = ?')
    .bind(transactionId, owner)
    .first<{ ok: number }>()
  if (!row) throw new HttpError(400, `Invalid ${field}`)
}

export async function assertOwnedPlan(env: Env, owner: string, planId: number): Promise<void> {
  const row = await env.DB.prepare('SELECT 1 AS ok FROM installment_plans WHERE id = ? AND owner = ?')
    .bind(planId, owner)
    .first<{ ok: number }>()
  if (!row) throw new HttpError(400, 'Invalid planId')
}
