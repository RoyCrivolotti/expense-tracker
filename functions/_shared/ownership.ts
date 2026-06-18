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
