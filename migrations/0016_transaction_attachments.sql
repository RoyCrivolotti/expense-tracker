-- Receipt attachments: photos and PDFs pinned to a transaction, for the case a
-- flag starts — you claim expenses back weeks later and the employer wants the
-- receipt. Bytes live in R2 (bucket `roy-expenses-receipts`, binding RECEIPTS);
-- only metadata lives here, so this table stays small and the daily D1 backup
-- keeps covering it.
--
-- object_key is server-generated and content-addressed (see receiptKeys.ts); it
-- never contains a user-supplied string, which is what makes path traversal
-- impossible by construction. The client never supplies a key: the serve route
-- resolves id -> row -> object_key, scoped by owner.
--
-- D1/SQLite ALTER cannot add enforced foreign keys, and a plain CREATE TABLE
-- reference to transactions(id) would not cascade on delete anyway under D1's
-- default PRAGMA, so transaction_id is a plain column and integrity is enforced
-- in app code (assertOwnedTransaction in functions/_shared/ownership.ts). Same
-- shape as plan_id (0009) and flag_id (0015).
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0016_transaction_attachments.sql

CREATE TABLE transaction_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  transaction_id INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  thumb_key TEXT,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  -- Shown to the user and used for the download filename. Never part of a key.
  original_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_attachments_owner ON transaction_attachments (owner);
CREATE INDEX idx_attachments_txn ON transaction_attachments (owner, transaction_id);

-- Content-addressed keys make re-uploading the same photo idempotent; the
-- unique index turns "already uploaded" into a constraint rather than a
-- duplicate R2 object silently paying for itself twice.
CREATE UNIQUE INDEX idx_attachments_object_key ON transaction_attachments (object_key);
