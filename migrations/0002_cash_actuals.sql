-- Recorded real bank-cash balance per budget month, for cash reconciliation.
-- Entered manually after the deferred cards are paid (~12th–15th); the Gap is
-- actual_cash_cents minus the engine's expected cash for that month.
CREATE TABLE IF NOT EXISTS cash_actuals (
  year_month TEXT PRIMARY KEY,
  actual_cash_cents INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
