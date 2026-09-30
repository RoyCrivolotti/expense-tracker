import type { NewLabel } from '../domain/data/dataSource'
import type { Label, Transaction } from '../domain/types'
import type { Env } from './env'
import { HttpError } from './http'
import { assertOwnedLabel, assertOwnedTransaction } from './ownership'
import { toLabel, toStoredTxn, type LabelRow, type TxnRow } from './rows'
import { deriveOne } from './dbWrite'

type ColumnMap = Record<keyof NewLabel, string>

const LABEL_COLUMNS: ColumnMap = {
  name: 'name',
  color: 'color',
  description: 'description',
  sortOrder: 'sort_order',
  active: 'active',
}

function coerce(key: keyof NewLabel, value: unknown): unknown {
  if (key === 'active') return value ? 1 : 0
  // An explicit '' from the editor means "no description"; store NULL for it.
  if (key === 'description') return value === '' ? null : (value ?? null)
  return value ?? null
}

export async function createLabel(env: Env, owner: string, input: NewLabel): Promise<Label> {
  const row = await env.DB.prepare(
    `INSERT INTO labels (owner, name, color, description, sort_order, active)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      owner,
      input.name,
      input.color,
      input.description ?? null,
      input.sortOrder,
      input.active ? 1 : 0,
    )
    .first<LabelRow>()
  if (!row) throw new HttpError(500, 'Label insert failed')
  return toLabel(row)
}

export async function updateLabel(
  env: Env,
  owner: string,
  id: number,
  patch: Partial<NewLabel>,
): Promise<Label> {
  const keys = (Object.keys(patch) as (keyof NewLabel)[]).filter((k) => k in LABEL_COLUMNS)
  if (keys.length === 0) throw new HttpError(400, 'Empty patch')
  const sets = keys.map((k) => `${LABEL_COLUMNS[k]} = ?`).join(', ')
  const values = keys.map((k) => coerce(k, patch[k]))
  const row = await env.DB.prepare(`UPDATE labels SET ${sets} WHERE id = ? AND owner = ? RETURNING *`)
    .bind(...values, id, owner)
    .first<LabelRow>()
  if (!row) throw new HttpError(404, 'Label not found')
  return toLabel(row)
}

/**
 * Deleting a label unlinks it from its transactions rather than reassigning them,
 * same shape as deleteFlag. `transaction_labels` also cascades via its own FK
 * (migration 0028), but that is not relied on alone — see the migration's own
 * comment on why — so this explicit delete is the real guarantee. No owner join
 * needed on the first statement: every `transaction_labels` row referencing this
 * label was created by `setTransactionLabels`, which ownership-checks both sides
 * against the same owner, so a label id this owner does not have can reference no
 * row that does either.
 */
export async function deleteLabel(
  env: Env,
  owner: string,
  id: number,
): Promise<{ unlabeled: number }> {
  await assertOwnedLabel(env, owner, id)
  const [cleared] = await env.DB.batch([
    env.DB.prepare('DELETE FROM transaction_labels WHERE label_id = ?').bind(id),
    // A flag configured to auto-apply this label must not keep pointing at a
    // label that no longer exists (migration 0029's own invariant).
    env.DB
      .prepare('UPDATE flags SET auto_label_id = NULL WHERE auto_label_id = ? AND owner = ?')
      .bind(id, owner),
    env.DB.prepare('DELETE FROM labels WHERE id = ? AND owner = ?').bind(id, owner),
  ])
  return { unlabeled: cleared?.meta?.changes ?? 0 }
}

/**
 * Retroactive half of a flag's auto-label: every transaction currently carrying
 * `flagId` picks up `labelId` immediately. `INSERT OR IGNORE` against
 * transaction_labels' `UNIQUE(transaction_id, label_id)` makes this idempotent —
 * safe to run again, or against a row that already has the label some other way.
 */
export function applyLabelToFlaggedTransactionsStatement(
  env: Env,
  owner: string,
  flagId: number,
  labelId: number,
) {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO transaction_labels (transaction_id, label_id)
     SELECT t.id, ? FROM transactions t WHERE t.flag_id = ? AND t.owner = ?`,
  ).bind(labelId, flagId, owner)
}

/**
 * Replace a transaction's whole label set. A `DELETE` then `INSERT` batch rather
 * than a diff: the set is typically small (a handful of labels), and diffing would
 * only save a few statements at the cost of real complexity.
 */
export async function setTransactionLabels(
  env: Env,
  owner: string,
  transactionId: number,
  labelIds: number[],
): Promise<Transaction> {
  await assertOwnedTransaction(env, owner, transactionId, 'transactionId')
  for (const labelId of labelIds) await assertOwnedLabel(env, owner, labelId)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM transaction_labels WHERE transaction_id = ?').bind(transactionId),
    ...labelIds.map((labelId) =>
      env.DB
        .prepare('INSERT INTO transaction_labels (transaction_id, label_id) VALUES (?, ?)')
        .bind(transactionId, labelId),
    ),
  ])
  const row = await env.DB.prepare('SELECT * FROM transactions WHERE id = ? AND owner = ?')
    .bind(transactionId, owner)
    .first<TxnRow>()
  if (!row) throw new HttpError(404, 'Transaction not found')
  return deriveOne(env, owner, toStoredTxn(row))
}
