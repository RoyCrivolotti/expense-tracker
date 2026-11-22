export async function listGroupGrantIds(
  db: D1Database,
  email: string,
): Promise<string[]> {
  const result = await db
    .prepare('SELECT group_id FROM user_group_grants WHERE email = ?')
    .bind(email)
    .all<{ group_id: string }>()
  return (result.results ?? []).map((row) => row.group_id)
}

export async function grantGroupRow(
  db: D1Database,
  email: string,
  groupId: string,
  grantedBy: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO user_group_grants (email, group_id, granted_at, granted_by)
       VALUES (?, ?, datetime('now'), ?)
       ON CONFLICT(email, group_id) DO UPDATE SET
         granted_at = datetime('now'),
         granted_by = excluded.granted_by`,
    )
    .bind(email, groupId, grantedBy)
    .run()
}

export async function revokeGroupRow(
  db: D1Database,
  email: string,
  groupId: string,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM user_group_grants WHERE email = ? AND group_id = ?')
    .bind(email, groupId)
    .run()
  return (result.meta.changes ?? 0) > 0
}

export async function revokeAllGroupRows(
  db: D1Database,
  email: string,
): Promise<void> {
  await db.prepare('DELETE FROM user_group_grants WHERE email = ?').bind(email).run()
}
