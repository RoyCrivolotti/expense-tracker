-- Backfill oncall group for existing active users.
--
-- Run:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0007_oncall_group.sql

INSERT OR IGNORE INTO user_group_grants (email, group_id, granted_by)
SELECT email, 'oncall', 'migration-backfill' FROM allowed_users WHERE status = 'active';
