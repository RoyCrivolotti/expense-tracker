import type { WealthAccount } from '../domain/types'
import type { DeleteWealthAccountResult, NewWealthAccount } from '../domain/data/dataSource'
import type { Env } from './env'
import { HttpError } from './http'
import { toWealthAccount, type WealthAccountRow } from './rows'

export async function createWealthAccount(
  env: Env,
  owner: string,
  input: NewWealthAccount,
): Promise<WealthAccount> {
  if (!input.name?.trim()) throw new HttpError(400, 'Account name is required')
  const validKinds = ['investment', 'cash', 'other_asset', 'debt'] as const
  if (!validKinds.includes(input.kind)) throw new HttpError(400, 'Invalid account kind')

  const row = await env.DB.prepare(
    `INSERT INTO wealth_accounts (owner, name, kind, sort_order, archived)
     VALUES (?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(owner, input.name.trim(), input.kind, input.sortOrder, input.archived ? 1 : 0)
    .first<WealthAccountRow>()
  if (!row) throw new HttpError(500, 'Wealth account insert failed')
  return toWealthAccount(row)
}

export async function updateWealthAccount(
  env: Env,
  owner: string,
  id: number,
  patch: Partial<NewWealthAccount>,
): Promise<WealthAccount> {
  const fields: string[] = []
  const values: unknown[] = []

  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) throw new HttpError(400, 'Account name is required')
    fields.push('name = ?')
    values.push(name)
  }
  if (patch.kind !== undefined) {
    const validKinds = ['investment', 'cash', 'other_asset', 'debt'] as const
    if (!validKinds.includes(patch.kind)) throw new HttpError(400, 'Invalid account kind')
    fields.push('kind = ?')
    values.push(patch.kind)
  }
  if (patch.sortOrder !== undefined) {
    fields.push('sort_order = ?')
    values.push(patch.sortOrder)
  }
  if (patch.archived !== undefined) {
    fields.push('archived = ?')
    values.push(patch.archived ? 1 : 0)
  }
  if (fields.length === 0) throw new HttpError(400, 'Empty patch')

  const row = await env.DB.prepare(
    `UPDATE wealth_accounts SET ${fields.join(', ')} WHERE id = ? AND owner = ? RETURNING *`,
  )
    .bind(...values, id, owner)
    .first<WealthAccountRow>()
  if (!row) throw new HttpError(404, 'Wealth account not found')
  return toWealthAccount(row)
}

export async function deleteWealthAccount(
  env: Env,
  owner: string,
  id: number,
): Promise<DeleteWealthAccountResult> {
  // Check if the account has entries — archive instead of hard-deleting to preserve history.
  const usage = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM wealth_checkin_entries e
     JOIN wealth_checkins c ON c.id = e.checkin_id
     WHERE c.owner = ? AND e.account_id = ?`,
  )
    .bind(owner, id)
    .first<{ n: number }>()

  if ((usage?.n ?? 0) > 0) {
    // Soft-delete: archive rather than destroy so existing check-in data is preserved.
    const result = await env.DB.prepare(
      'UPDATE wealth_accounts SET archived = 1 WHERE id = ? AND owner = ? RETURNING id',
    )
      .bind(id, owner)
      .first<{ id: number }>()
    if (!result) throw new HttpError(404, 'Wealth account not found')
    return { archived: true }
  }

  const result = await env.DB.prepare('DELETE FROM wealth_accounts WHERE id = ? AND owner = ?').bind(id, owner).run()
  if ((result.meta.changes ?? 0) === 0) throw new HttpError(404, 'Wealth account not found')
  return { archived: false }
}
