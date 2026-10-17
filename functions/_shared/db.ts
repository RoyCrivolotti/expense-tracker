import type { ExpenseDataset } from '../domain/types'
import { deriveTransactions } from '../domain/engine/status'
import type { Env } from './env'
import { backfillInstallments } from './dbInstallmentBackfill'
import { loadReferenceTables, rows } from './dbReference'
import { toAttachment, toStoredTxn, type AttachmentRow, type TxnRow } from './rows'

/** Read every table for one owner and assemble a dataset with derived statuses. */
export async function loadDataset(env: Env, owner: string): Promise<ExpenseDataset> {
  await backfillInstallments(env, owner).catch((err) => {
    console.error('installment backfill failed', err)
  })
  const [reference, attachmentRows, txns, transactionLabelRows] = await Promise.all([
    loadReferenceTables(env, owner),
    // Metadata only — the bytes are fetched by URL from /api/expenses/attachments/:id.
    rows<AttachmentRow>(
      env.DB,
      'SELECT * FROM transaction_attachments WHERE owner = ? ORDER BY transaction_id, id',
      owner,
    ),
    rows<TxnRow>(
      env.DB,
      'SELECT * FROM transactions WHERE owner = ? ORDER BY date DESC, id DESC',
      owner,
    ),
    // Load every transaction_labels row for this owner in one query, keyed by
    // transaction_id below. Joined to labels too, not just transactions: a
    // transaction_labels row whose label no longer exists is dropped here rather
    // than surfaced, the same tolerance flagGroups.ts already gives a dangling
    // flagId. deleteLabel cleans these up itself, but a read path should not
    // assume every write path got that right.
    env.DB.prepare(
      `SELECT tl.transaction_id, tl.label_id FROM transaction_labels tl
       JOIN transactions t ON t.id = tl.transaction_id
       JOIN labels l ON l.id = tl.label_id
       WHERE t.owner = ?`,
    )
      .bind(owner)
      .all<{ transaction_id: number; label_id: number }>()
      .then((r) => r.results ?? []),
  ])

  // Group by transaction_id for O(1) lookup when attaching labelIds below.
  const labelIdsByTxn = new Map<number, number[]>()
  for (const tl of transactionLabelRows) {
    const list = labelIdsByTxn.get(tl.transaction_id) ?? []
    list.push(tl.label_id)
    labelIdsByTxn.set(tl.transaction_id, list)
  }
  // labelIds is not a real column, so it is merged on after deriveTransactions
  // rather than carried through toStoredTxn — same reason status itself is
  // derived rather than stored.
  const transactions = deriveTransactions(
    txns.map(toStoredTxn),
    reference.accounts,
    reference.accountStatements,
  ).map((t) => ({ ...t, labelIds: labelIdsByTxn.get(t.id) ?? [] }))

  return { ...reference, attachments: attachmentRows.map(toAttachment), transactions }
}

/** Distinct owner emails that have rows in D1 (used by scheduled backups). */
export async function listOwners(env: Env): Promise<string[]> {
  const result = await env.DB.prepare(
    `SELECT owner FROM (
       SELECT owner FROM transactions
       UNION
       SELECT owner FROM categories
       UNION
       SELECT owner FROM settings
     ) GROUP BY owner ORDER BY owner`,
  ).all<{ owner: string }>()
  return (result.results ?? []).map((r) => r.owner).filter(Boolean)
}
