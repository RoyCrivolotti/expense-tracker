-- Installment plans: a purchase split into N fixed monthly payments (e.g. a
-- phone financed over 24 months). Distinct from recurring prediction: a plan is
-- a declared, bounded commitment, owner-scoped and persisted. Each month's due
-- payment is logged as a normal transaction linked back via plan_id +
-- installment_index (the index the server assigns from the plan schedule).
--
-- D1/SQLite ALTER cannot add enforced foreign keys, so the plan_id link on
-- transactions is a plain column; ownership/integrity is enforced in the app.
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0009_installment_plans.sql

CREATE TABLE installment_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  description TEXT NOT NULL,
  total_count INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'expense' CHECK (type IN ('expense', 'income', 'investment', 'refund')),
  -- Budget month (YYYY-MM) when start_installment_index is due; anchors the schedule.
  anchor_budget_month TEXT NOT NULL,
  -- First installment number tracked in the app (1 for a fresh plan; higher for
  -- mid-flight imports where earlier payments never lived here).
  start_installment_index INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_installment_plans_owner ON installment_plans (owner);

ALTER TABLE transactions ADD COLUMN plan_id INTEGER;
ALTER TABLE transactions ADD COLUMN installment_index INTEGER;

CREATE UNIQUE INDEX idx_txn_plan_installment
  ON transactions (owner, plan_id, installment_index)
  WHERE plan_id IS NOT NULL AND installment_index IS NOT NULL;

CREATE INDEX idx_txn_plan ON transactions (owner, plan_id) WHERE plan_id IS NOT NULL;
