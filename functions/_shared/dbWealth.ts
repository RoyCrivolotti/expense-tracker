import type { WealthAccount, WealthCheckin } from '../domain/types'
import type { NewWealthAccount, NewWealthCheckin } from '../domain/data/dataSource'
import type { Env } from './env'
import { HttpError } from './http'
import {
  toWealthAccount,
  toWealthCheckin,
  toWealthCheckinEntry,
  type WealthAccountRow,
  type WealthCheckinEntryRow,
  type WealthCheckinRow,
} from './rows'

// ─── Wealth Accounts ─────────────────────────────────────────────────────────

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
): Promise<void> {
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
    return
  }

  const result = await env.DB.prepare(
    'DELETE FROM wealth_accounts WHERE id = ? AND owner = ?',
  )
    .bind(id, owner)
    .run()
  if ((result.meta.changes ?? 0) === 0) throw new HttpError(404, 'Wealth account not found')
}

// ─── Wealth Checkins ──────────────────────────────────────────────────────────

async function loadCheckinWithEntries(
  env: Env,
  checkinId: number,
): Promise<WealthCheckin> {
  const [checkinRow, entryRows] = await Promise.all([
    env.DB.prepare('SELECT * FROM wealth_checkins WHERE id = ?')
      .bind(checkinId)
      .first<WealthCheckinRow>(),
    env.DB.prepare('SELECT * FROM wealth_checkin_entries WHERE checkin_id = ?')
      .bind(checkinId)
      .all<WealthCheckinEntryRow>()
      .then((r) => r.results ?? []),
  ])
  if (!checkinRow) throw new HttpError(404, 'Wealth check-in not found')
  return toWealthCheckin(checkinRow, entryRows.map(toWealthCheckinEntry))
}

async function assertOwnedAccountIds(
  env: Env,
  owner: string,
  accountIds: number[],
): Promise<void> {
  for (const accountId of accountIds) {
    const row = await env.DB.prepare(
      'SELECT id FROM wealth_accounts WHERE id = ? AND owner = ?',
    )
      .bind(accountId, owner)
      .first<{ id: number }>()
    if (!row) throw new HttpError(400, `Wealth account ${accountId} not found or not owned`)
  }
}

export async function createWealthCheckin(
  env: Env,
  owner: string,
  input: NewWealthCheckin,
): Promise<WealthCheckin> {
  if (!input.checkinDate?.match(/^\d{4}-\d{2}-\d{2}$/)) {
    throw new HttpError(400, 'checkinDate must be YYYY-MM-DD')
  }

  // Validate all entry account IDs belong to this owner before inserting anything.
  if (input.entries.length > 0) {
    await assertOwnedAccountIds(
      env,
      owner,
      input.entries.map((e) => e.accountId),
    )
  }

  // Insert the checkin header, then entries in a batch. On entry failure, compensate by
  // deleting the orphaned header so the DB stays consistent.
  const checkinRow = await env.DB.prepare(
    `INSERT INTO wealth_checkins (owner, checkin_date, note) VALUES (?, ?, ?) RETURNING *`,
  )
    .bind(owner, input.checkinDate, input.note ?? null)
    .first<WealthCheckinRow>()
  if (!checkinRow) throw new HttpError(500, 'Wealth check-in insert failed')

  if (input.entries.length > 0) {
    try {
      await env.DB.batch(
        input.entries.map((e) =>
          env.DB.prepare(
            `INSERT INTO wealth_checkin_entries (checkin_id, account_id, value_cents)
             VALUES (?, ?, ?)`,
          ).bind(checkinRow.id, e.accountId, e.valueCents),
        ),
      )
    } catch (err) {
      // Compensate: remove the orphaned header so no partial check-in is left.
      await env.DB.prepare('DELETE FROM wealth_checkins WHERE id = ?').bind(checkinRow.id).run()
      throw err
    }
  }

  return loadCheckinWithEntries(env, checkinRow.id)
}

export async function updateWealthCheckin(
  env: Env,
  owner: string,
  id: number,
  patch: Partial<NewWealthCheckin>,
): Promise<WealthCheckin> {
  // Verify ownership before mutating.
  const existing = await env.DB.prepare(
    'SELECT id FROM wealth_checkins WHERE id = ? AND owner = ?',
  )
    .bind(id, owner)
    .first<{ id: number }>()
  if (!existing) throw new HttpError(404, 'Wealth check-in not found')

  if (patch.checkinDate !== undefined || patch.note !== undefined) {
    const fields: string[] = []
    const values: unknown[] = []
    if (patch.checkinDate !== undefined) {
      if (!patch.checkinDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        throw new HttpError(400, 'checkinDate must be YYYY-MM-DD')
      }
      fields.push('checkin_date = ?')
      values.push(patch.checkinDate)
    }
    if (patch.note !== undefined) {
      fields.push('note = ?')
      values.push(patch.note ?? null)
    }
    if (fields.length > 0) {
      await env.DB.prepare(
        `UPDATE wealth_checkins SET ${fields.join(', ')} WHERE id = ? AND owner = ?`,
      )
        .bind(...values, id, owner)
        .run()
    }
  }

  // Replace entries when provided — delete existing and re-insert atomically in one batch.
  if (patch.entries !== undefined) {
    if (patch.entries.length > 0) {
      await assertOwnedAccountIds(
        env,
        owner,
        patch.entries.map((e) => e.accountId),
      )
    }
    // Single batch is atomic: DELETE + INSERTs either all succeed or all roll back.
    await env.DB.batch([
      env.DB.prepare('DELETE FROM wealth_checkin_entries WHERE checkin_id = ?').bind(id),
      ...patch.entries.map((e) =>
        env.DB.prepare(
          `INSERT INTO wealth_checkin_entries (checkin_id, account_id, value_cents)
           VALUES (?, ?, ?)`,
        ).bind(id, e.accountId, e.valueCents),
      ),
    ])
  }

  return loadCheckinWithEntries(env, id)
}

export async function deleteWealthCheckin(
  env: Env,
  owner: string,
  id: number,
): Promise<void> {
  // entries cascade-delete via FK.
  const result = await env.DB.prepare(
    'DELETE FROM wealth_checkins WHERE id = ? AND owner = ?',
  )
    .bind(id, owner)
    .run()
  if ((result.meta.changes ?? 0) === 0) throw new HttpError(404, 'Wealth check-in not found')
}
