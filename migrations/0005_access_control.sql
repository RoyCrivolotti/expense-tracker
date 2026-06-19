-- App-level access control (D1 allowlist + access requests).
-- Cloudflare Access handles authentication only (Google sign-in).
--
-- Run:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0005_access_control.sql

CREATE TABLE IF NOT EXISTS allowed_users (
  email TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  granted_by TEXT,
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS access_requests (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_access_requests_email_status
  ON access_requests (email, status);
