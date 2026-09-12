import type { AttachmentSource, NewAttachment } from '../domain/data/dataSource'
import type { TransactionAttachment } from '../domain/types'
import type { Env } from './env'
import { HttpError } from './http'
import { toAttachment, type AttachmentRow } from './rows'

export async function transactionExists(
  env: Env,
  owner: string,
  id: number,
): Promise<boolean> {
  const row = await env.DB.prepare('SELECT 1 AS ok FROM transactions WHERE id = ? AND owner = ?')
    .bind(id, owner)
    .first<{ ok: number }>()
  return row != null
}

export async function listAttachments(
  env: Env,
  owner: string,
  transactionId: number,
): Promise<TransactionAttachment[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM transaction_attachments
     WHERE owner = ? AND transaction_id = ? ORDER BY id`,
  )
    .bind(owner, transactionId)
    .all<AttachmentRow>()
  return (results ?? []).map(toAttachment)
}

export async function findAttachmentSource(
  env: Env,
  owner: string,
  id: number,
): Promise<AttachmentSource | null> {
  const row = await env.DB.prepare(
    'SELECT * FROM transaction_attachments WHERE id = ? AND owner = ?',
  )
    .bind(id, owner)
    .first<AttachmentRow>()
  if (!row) return null
  return {
    objectKey: row.object_key,
    contentType: row.content_type,
    ...(row.thumb_key ? { thumbKey: row.thumb_key } : {}),
    ...(row.original_name ? { originalName: row.original_name } : {}),
  }
}

export async function createAttachment(
  env: Env,
  owner: string,
  input: NewAttachment,
): Promise<TransactionAttachment> {
  const row = await env.DB.prepare(
    `INSERT INTO transaction_attachments
       (owner, transaction_id, object_key, thumb_key, content_type, byte_size, width, height, original_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      owner,
      input.transactionId,
      input.objectKey,
      input.thumbKey ?? null,
      input.contentType,
      input.byteSize,
      input.width ?? null,
      input.height ?? null,
      input.originalName ?? null,
    )
    .first<AttachmentRow>()
  if (!row) throw new HttpError(500, 'Attachment insert failed')
  return toAttachment(row)
}

/**
 * Deletes the row and hands back the R2 keys. The bytes are deleted afterwards,
 * best-effort: an R2 delete cannot join a D1 batch, and the failure mode we care
 * about is the reverse order — bytes gone while the row still points at them,
 * which would render a broken receipt. An orphaned object costs a few hundred KB
 * until the backup cron's sweep picks it up.
 */
export async function deleteAttachment(
  env: Env,
  owner: string,
  id: number,
): Promise<{ objectKey: string; thumbKey?: string }> {
  const row = await env.DB.prepare(
    'DELETE FROM transaction_attachments WHERE id = ? AND owner = ? RETURNING *',
  )
    .bind(id, owner)
    .first<AttachmentRow>()
  if (!row) throw new HttpError(404, 'Attachment not found')
  return { objectKey: row.object_key, ...(row.thumb_key ? { thumbKey: row.thumb_key } : {}) }
}

export async function attachmentBytesUsed(env: Env, owner: string): Promise<number> {
  // One cheap D1 aggregate rather than an R2 list, which would burn Class A ops
  // on every upload.
  const row = await env.DB.prepare(
    'SELECT COALESCE(SUM(byte_size), 0) AS total FROM transaction_attachments WHERE owner = ?',
  )
    .bind(owner)
    .first<{ total: number }>()
  return row?.total ?? 0
}

/**
 * R2 keys held by these transactions. Read *before* deleting them, since the
 * rows carrying the keys go with the transaction.
 */
export async function attachmentKeysForTransactions(
  env: Env,
  owner: string,
  transactionIds: number[],
): Promise<string[]> {
  if (transactionIds.length === 0) return []
  const placeholders = transactionIds.map(() => '?').join(', ')
  const { results } = await env.DB.prepare(
    `SELECT object_key, thumb_key FROM transaction_attachments
     WHERE owner = ? AND transaction_id IN (${placeholders})`,
  )
    .bind(owner, ...transactionIds)
    .all<{ object_key: string; thumb_key: string | null }>()
  return (results ?? []).flatMap((r) => (r.thumb_key ? [r.object_key, r.thumb_key] : [r.object_key]))
}

/** Every stored key for one owner, for revoke cleanup. */
export async function ownerAttachmentKeys(env: Env, owner: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    'SELECT object_key, thumb_key FROM transaction_attachments WHERE owner = ?',
  )
    .bind(owner)
    .all<{ object_key: string; thumb_key: string | null }>()
  return (results ?? []).flatMap((r) => (r.thumb_key ? [r.object_key, r.thumb_key] : [r.object_key]))
}
