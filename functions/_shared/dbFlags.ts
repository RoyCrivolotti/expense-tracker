import type { NewFlag } from '../domain/data/dataSource'
import type { Flag } from '../domain/types'
import type { Env } from './env'
import { HttpError } from './http'
import { assertOwnedFlag } from './ownership'
import { toFlag, type FlagRow } from './rows'

type ColumnMap = Record<keyof NewFlag, string>

const FLAG_COLUMNS: ColumnMap = {
  name: 'name',
  color: 'color',
  description: 'description',
  reimbursable: 'reimbursable',
  sortOrder: 'sort_order',
  active: 'active',
}

function coerce(key: keyof NewFlag, value: unknown): unknown {
  if (key === 'active' || key === 'reimbursable') return value ? 1 : 0
  // An explicit '' from the editor means "no description"; store NULL for it.
  if (key === 'description') return value === '' ? null : (value ?? null)
  return value ?? null
}

export async function createFlag(env: Env, owner: string, input: NewFlag): Promise<Flag> {
  const row = await env.DB.prepare(
    `INSERT INTO flags (owner, name, color, description, reimbursable, sort_order, active)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      owner,
      input.name,
      input.color,
      input.description ?? null,
      input.reimbursable ? 1 : 0,
      input.sortOrder,
      input.active ? 1 : 0,
    )
    .first<FlagRow>()
  if (!row) throw new HttpError(500, 'Flag insert failed')
  return toFlag(row)
}

export async function updateFlag(
  env: Env,
  owner: string,
  id: number,
  patch: Partial<NewFlag>,
): Promise<Flag> {
  const keys = (Object.keys(patch) as (keyof NewFlag)[]).filter((k) => k in FLAG_COLUMNS)
  if (keys.length === 0) throw new HttpError(400, 'Empty patch')
  const sets = keys.map((k) => `${FLAG_COLUMNS[k]} = ?`).join(', ')
  const values = keys.map((k) => coerce(k, patch[k]))
  const row = await env.DB.prepare(`UPDATE flags SET ${sets} WHERE id = ? AND owner = ? RETURNING *`)
    .bind(...values, id, owner)
    .first<FlagRow>()
  if (!row) throw new HttpError(404, 'Flag not found')
  return toFlag(row)
}

/**
 * Deleting a flag clears it from its transactions rather than reassigning them:
 * `flag_id` is nullable, so unlike a category there is nowhere the rows *have*
 * to go. Both statements run in one `batch()` so a mid-delete failure can never
 * leave transactions pointing at a flag row that no longer exists.
 */
export async function deleteFlag(
  env: Env,
  owner: string,
  id: number,
): Promise<{ unflagged: number }> {
  await assertOwnedFlag(env, owner, id)
  const [cleared] = await env.DB.batch([
    env.DB
      .prepare('UPDATE transactions SET flag_id = NULL WHERE flag_id = ? AND owner = ?')
      .bind(id, owner),
    env.DB.prepare('DELETE FROM flags WHERE id = ? AND owner = ?').bind(id, owner),
  ])
  return { unflagged: cleared?.meta?.changes ?? 0 }
}
