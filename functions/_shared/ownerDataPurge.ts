/** Delete all expense-tracker rows for one owner (revoke cleanup). */
export async function purgeOwnerExpenseData(db: D1Database, ownerEmail: string): Promise<void> {
  const owner = ownerEmail.trim().toLowerCase()
  if (!owner) return

  await db.batch([
    db.prepare('DELETE FROM transactions WHERE owner = ?').bind(owner),
    db.prepare('DELETE FROM account_statements WHERE owner = ?').bind(owner),
    db.prepare('DELETE FROM cash_actuals WHERE owner = ?').bind(owner),
    db.prepare('DELETE FROM categories WHERE owner = ?').bind(owner),
    db.prepare('DELETE FROM accounts WHERE owner = ?').bind(owner),
    db.prepare('DELETE FROM settings WHERE owner = ?').bind(owner),
    db.prepare('DELETE FROM goal_inputs WHERE owner = ?').bind(owner),
    db.prepare('DELETE FROM access_requests WHERE email = ?').bind(owner),
  ])
}
