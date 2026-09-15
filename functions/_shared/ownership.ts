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

/**
 * `settledBy` points at another transaction (the reimbursement payment), so it needs
 * the same tenancy check as any other foreign key — without it a patch can aim a row's
 * settlement at an id belonging to someone else, and the delete-time cleanup that would
 * normally release it is scoped `AND owner = ?`, so nothing can ever reconcile it.
 */
export async function assertOwnedTransaction(
  env: Env,
  owner: string,
  transactionId: number,
): Promise<void> {
  const row = await env.DB.prepare('SELECT 1 AS ok FROM transactions WHERE id = ? AND owner = ?')
    .bind(transactionId, owner)
    .first<{ ok: number }>()
  if (!row) throw new HttpError(400, 'Invalid settledBy')
}

export async function assertOwnedPlan(env: Env, owner: string, planId: number): Promise<void> {
  const row = await env.DB.prepare('SELECT 1 AS ok FROM installment_plans WHERE id = ? AND owner = ?')
    .bind(planId, owner)
    .first<{ ok: number }>()
  if (!row) throw new HttpError(400, 'Invalid planId')
}
