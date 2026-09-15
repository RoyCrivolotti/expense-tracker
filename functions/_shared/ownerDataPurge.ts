import { ownerAttachmentKeys } from './dbAttachments'
import type { Env } from './env'
import { receiptStore } from './receiptStoreFactory'

/**
 * Delete every trace of one owner (revoke cleanup).
 *
 * Receipt bytes first: the `transaction_attachments` rows are the only record of which
 * R2 objects are this owner's, and the D1 batch deletes them. Reversed, the bytes are
 * unreachable forever.
 *
 * The D1 half is private so that ordering cannot be bypassed by a new call site.
 */
export async function purgeOwnerData(env: Env, ownerEmail: string): Promise<void> {
  const owner = ownerEmail.trim().toLowerCase()
  if (!owner) return
  await purgeOwnerReceipts(env, owner)
  await purgeOwnerExpenseData(env.DB, owner)
}

/**
 * Best-effort: failing the revoke over an R2 error would leave the owner's rows, and
 * their access, in place. The warning names the owner because recovery is a manual
 * prefix sweep (docs/DEPLOYMENT.md).
 */
async function purgeOwnerReceipts(env: Env, owner: string): Promise<void> {
  const store = receiptStore(env)
  if (!store) return
  try {
    await store.deleteMany(await ownerAttachmentKeys(env, owner))
  } catch {
    console.warn(`revoke: receipt bytes for ${owner} were not deleted`)
  }
}

/** Delete all expense-tracker rows for one owner. Private: see purgeOwnerData. */
async function purgeOwnerExpenseData(db: D1Database, owner: string): Promise<void> {
  // wealth_checkin_entries is deleted via ON DELETE CASCADE from wealth_checkins.
  await db.batch([
    db.prepare('DELETE FROM transactions WHERE owner = ?').bind(owner),
    db.prepare('DELETE FROM account_statements WHERE owner = ?').bind(owner),
    db.prepare('DELETE FROM cash_actuals WHERE owner = ?').bind(owner),
    db.prepare('DELETE FROM transaction_attachments WHERE owner = ?').bind(owner),
    db.prepare('DELETE FROM flags WHERE owner = ?').bind(owner),
    db.prepare('DELETE FROM categories WHERE owner = ?').bind(owner),
    db.prepare('DELETE FROM accounts WHERE owner = ?').bind(owner),
    db.prepare('DELETE FROM settings WHERE owner = ?').bind(owner),
    db.prepare('DELETE FROM goal_inputs WHERE owner = ?').bind(owner),
    db.prepare('DELETE FROM goal_scenarios WHERE owner = ?').bind(owner),
    db.prepare('DELETE FROM installment_plans WHERE owner = ?').bind(owner),
    db.prepare('DELETE FROM wealth_checkins WHERE owner = ?').bind(owner),
    db.prepare('DELETE FROM wealth_accounts WHERE owner = ?').bind(owner),
    db.prepare('DELETE FROM access_requests WHERE email = ?').bind(owner),
  ])
}
