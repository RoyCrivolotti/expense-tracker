-- Transaction flags: reusable, named markers a user applies to transactions to
-- track something that outlives a budget month — "Work travel — reimburse",
-- "Tax deductible", "Dispute with bank". Distinct from categories: a category
-- says what the money was for and carries a budget, a flag says what still has
-- to happen about it. Archiving a flag (active = 0) hides it from the pickers
-- without unlinking the transactions that already carry it, so a settled claim
-- keeps its history.
--
-- One flag per transaction, so per-flag totals ("how much am I owed?") always
-- add up to something meaningful.
--
-- D1/SQLite ALTER cannot add enforced foreign keys, so the flag_id link on
-- transactions is a plain column; ownership/integrity is enforced in the app
-- (see assertOwnedFlag in functions/_shared/ownership.ts). Same shape as the
-- plan_id link added in 0009.
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0015_transaction_flags.sql

CREATE TABLE flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_flags_owner ON flags (owner);

ALTER TABLE transactions ADD COLUMN flag_id INTEGER;

-- Partial index: the overwhelming majority of transactions are unflagged, so
-- only the flagged ones are worth indexing (mirrors idx_txn_plan in 0009).
CREATE INDEX idx_txn_flag ON transactions (owner, flag_id) WHERE flag_id IS NOT NULL;
