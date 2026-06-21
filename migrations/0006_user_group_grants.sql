-- Per-group access grants (hide-only MVP; server enforcement optional later).
--
-- Run:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0006_user_group_grants.sql

CREATE TABLE IF NOT EXISTS user_group_grants (
  email TEXT NOT NULL,
  group_id TEXT NOT NULL,
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  granted_by TEXT,
  PRIMARY KEY (email, group_id)
);

-- Preserve full access for existing active users.
INSERT OR IGNORE INTO user_group_grants (email, group_id, granted_by)
SELECT email, 'expenses', 'migration-backfill' FROM allowed_users WHERE status = 'active';

INSERT OR IGNORE INTO user_group_grants (email, group_id, granted_by)
SELECT email, 'finance', 'migration-backfill' FROM allowed_users WHERE status = 'active';

INSERT OR IGNORE INTO user_group_grants (email, group_id, granted_by)
SELECT email, 'legacy', 'migration-backfill' FROM allowed_users WHERE status = 'active';
