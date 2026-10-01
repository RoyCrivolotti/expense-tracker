-- Labels: reusable, named tags a user applies to transactions to record what they
-- persistently belong to — a trip, a project, a category of spending that outlives
-- any one claim. Distinct from a flag: a flag says "this still needs something done
-- about it" and clears once that happens (see 0015); a label says "this belongs to
-- X" and is never cleared by anything the app does on its own. A transaction can
-- carry any number of labels, which is why this needs a join table rather than a
-- column on transactions, unlike flag_id.
--
-- No reimbursement-specific fields here (no `reimbursable`) — reporting stays a flag
-- concept. Archiving (active = 0) hides a label from the pickers without touching
-- transaction_labels rows already pointing at it, same contract as flags.active.
--
-- transaction_labels is a genuine many-to-many join table. Unlike flag_id (added via
-- ALTER onto an existing table, where D1/SQLite cannot add an enforced foreign key),
-- this is a fresh CREATE TABLE, so real FKs with ON DELETE CASCADE are used here,
-- matching wealth_checkin_entries (0012). Application code does not rely on the
-- cascade alone: this repo's own migrations disagree on whether D1 honours it by
-- default (compare 0016's comment against dbWealth.ts's deleteWealthCheckin), and no
-- test here runs real SQLite to settle it — so deleteLabel/deleteTransaction(s) also
-- run an explicit cleanup statement regardless. See functions/_shared/dbLabels.ts.
--
-- Nothing in the app reads or writes these tables yet (that lands in a follow-up
-- PR), so this is safe to apply in any order relative to the code deploy.
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0028_labels.sql

CREATE TABLE IF NOT EXISTS labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_labels_owner ON labels (owner);

CREATE TABLE IF NOT EXISTS transaction_labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
  label_id INTEGER NOT NULL REFERENCES labels (id) ON DELETE CASCADE,
  UNIQUE (transaction_id, label_id)
);

CREATE INDEX IF NOT EXISTS idx_transaction_labels_txn ON transaction_labels (transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_labels_label ON transaction_labels (label_id);
